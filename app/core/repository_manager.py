from dataclasses import dataclass
from pathlib import Path
import hashlib
import shutil
import sqlite3
import zipfile

from app.rag.vector_store import CodeVectorStore


@dataclass
class Repository:
    id: str
    name: str
    local_path: str
    source_type: str = "local"
    github_url: str | None = None
    indexing_status: str = "NOT_INDEXED"
    git_available: bool = False


class RepositoryManager:
    def __init__(
        self,
        repositories_root: str = "data/repositories",
        database_path: str = "data/repositories.db",
    ):
        self.repositories_root = Path(repositories_root).resolve()
        self.database_path = Path(database_path).resolve()

        self.repositories_root.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)

        self._initialize_database()

    def _connect(self):
        return sqlite3.connect(self.database_path)

    def _initialize_database(self):
        with self._connect() as connection:
            cursor = connection.cursor()

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS repositories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    local_path TEXT NOT NULL UNIQUE,
                    source_type TEXT NOT NULL DEFAULT 'local',
                    github_url TEXT,
                    indexing_status TEXT NOT NULL DEFAULT 'NOT_INDEXED',
                    git_available INTEGER NOT NULL DEFAULT 0
                )
                """
            )

            columns = {
                row[1]
                for row in cursor.execute(
                    "PRAGMA table_info(repositories)"
                ).fetchall()
            }

            if "indexing_status" not in columns:
                cursor.execute(
                    """
                    ALTER TABLE repositories
                    ADD COLUMN indexing_status TEXT NOT NULL DEFAULT 'NOT_INDEXED'
                    """
                )

            if "git_available" not in columns:
                cursor.execute(
                    """
                    ALTER TABLE repositories
                    ADD COLUMN git_available INTEGER NOT NULL DEFAULT 0
                    """
                )

            connection.commit()

    def validate_repository(self, repository_path: str) -> Path:
        path = Path(repository_path).expanduser().resolve()

        if not path.exists():
            raise ValueError(f"Repository path does not exist: {path}")

        if not path.is_dir():
            raise ValueError(f"Repository path is not a directory: {path}")

        return path

    def is_git_repository(self, repository_path: str) -> bool:
        path = Path(repository_path).resolve()
        return (path / ".git").exists()

    def get_repository_name(self, repository_path: str) -> str:
        path = Path(repository_path).resolve()
        return path.name

    def _generate_repository_id(self, name: str, repository_path: str) -> str:
        path_hash = hashlib.sha256(
            str(Path(repository_path).resolve()).encode("utf-8")
        ).hexdigest()[:8]

        safe_name = "".join(
            character if character.isalnum() or character in "-_"
            else "-"
            for character in name
        ).strip("-")

        if not safe_name:
            safe_name = "repository"

        return f"{safe_name}-{path_hash}"

    def create_repository(
        self,
        repository_path: str,
        source_type: str = "local",
        github_url: str | None = None,
    ) -> Repository:
        path = self.validate_repository(repository_path)

        existing = self.get_repository_by_path(str(path))

        if existing:
            detected_git = self.is_git_repository(str(path))

            if existing.git_available != detected_git:
                with self._connect() as connection:
                    connection.execute(
                        """
                        UPDATE repositories
                        SET git_available = ?
                        WHERE id = ?
                        """,
                        (int(detected_git), existing.id),
                    )
                    connection.commit()

                existing.git_available = detected_git

            return existing

        name = self.get_repository_name(str(path))
        repository_id = self._generate_repository_id(name, str(path))
        git_available = self.is_git_repository(str(path))

        repository = Repository(
            id=repository_id,
            name=name,
            local_path=str(path),
            source_type=source_type,
            github_url=github_url,
            indexing_status="NOT_INDEXED",
            git_available=git_available,
        )

        self.save_repository(repository)
        return repository

    def list_local_repositories(self) -> list[Repository]:
        repositories = []

        for child in sorted(self.repositories_root.iterdir()):
            if not child.is_dir():
                continue

            if child.name.startswith("."):
                continue

            existing = self.get_repository_by_path(str(child))

            if existing:
                detected_git = self.is_git_repository(str(child))

                if existing.git_available != detected_git:
                    with self._connect() as connection:
                        connection.execute(
                            """
                            UPDATE repositories
                            SET git_available = ?
                            WHERE id = ?
                            """,
                            (int(detected_git), existing.id),
                        )
                        connection.commit()

                    existing.git_available = detected_git

                repositories.append(existing)
            else:
                try:
                    repositories.append(
                        self.create_repository(
                            str(child),
                            source_type="local",
                        )
                    )
                except ValueError:
                    continue

        return repositories

    def add_local_repository(self, repository_path: str) -> Repository:
        return self.create_repository(
            repository_path=repository_path,
            source_type="local",
        )

    def _is_safe_zip_member(self, member_name: str) -> bool:
        member_path = Path(member_name)

        if member_path.is_absolute():
            return False

        if ".." in member_path.parts:
            return False

        return True

    def _detect_zip_project_root(self, extraction_root: Path) -> Path:
        children = [
            child
            for child in extraction_root.iterdir()
            if child.name != "__MACOSX"
        ]

        directories = [child for child in children if child.is_dir()]
        files = [child for child in children if child.is_file()]

        if len(directories) == 1 and not files:
            return directories[0]

        return extraction_root

    def extract_zip_repository(self, zip_path: str) -> Repository:
        zip_file = Path(zip_path).expanduser().resolve()

        if not zip_file.exists():
            raise ValueError(f"ZIP file does not exist: {zip_file}")

        if not zip_file.is_file():
            raise ValueError(f"ZIP path is not a file: {zip_file}")

        if zip_file.suffix.lower() != ".zip":
            raise ValueError("Only .zip files are supported.")

        with zipfile.ZipFile(zip_file, "r") as archive:
            members = archive.infolist()

            if not members:
                raise ValueError("The ZIP file is empty.")

            for member in members:
                if not self._is_safe_zip_member(member.filename):
                    raise ValueError(
                        f"Unsafe ZIP entry detected: {member.filename}"
                    )

            base_name = zip_file.stem
            extraction_root = self.repositories_root / base_name

            counter = 1
            while extraction_root.exists():
                extraction_root = (
                    self.repositories_root
                    / f"{base_name}-{counter}"
                )
                counter += 1

            extraction_root.mkdir(parents=True, exist_ok=False)

            archive.extractall(extraction_root)

        project_root = self._detect_zip_project_root(extraction_root)

        return self.create_repository(
            repository_path=str(project_root),
            source_type="zip",
        )

    def save_repository(self, repository: Repository):
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO repositories
                (
                    id,
                    name,
                    local_path,
                    source_type,
                    github_url,
                    indexing_status,
                    git_available
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    repository.id,
                    repository.name,
                    repository.local_path,
                    repository.source_type,
                    repository.github_url,
                    repository.indexing_status,
                    int(repository.git_available),
                ),
            )
            connection.commit()

    def get_repository(self, repository_id: str) -> Repository | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    local_path,
                    source_type,
                    github_url,
                    indexing_status,
                    git_available
                FROM repositories
                WHERE id = ?
                """,
                (repository_id,),
            ).fetchone()

        if not row:
            return None

        repository = Repository(
            id=row[0],
            name=row[1],
            local_path=row[2],
            source_type=row[3],
            github_url=row[4],
            indexing_status=row[5],
            git_available=bool(row[6]),
        )

        detected_git = self.is_git_repository(repository.local_path)

        if repository.git_available != detected_git:
            repository.git_available = detected_git

            with self._connect() as connection:
                connection.execute(
                    """
                    UPDATE repositories
                    SET git_available = ?
                    WHERE id = ?
                    """,
                    (int(detected_git), repository.id),
                )
                connection.commit()

        return repository

    def get_repository_by_path(
        self,
        repository_path: str,
    ) -> Repository | None:
        path = str(Path(repository_path).expanduser().resolve())

        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    local_path,
                    source_type,
                    github_url,
                    indexing_status,
                    git_available
                FROM repositories
                WHERE local_path = ?
                """,
                (path,),
            ).fetchone()

        if not row:
            return None

        repository = Repository(
            id=row[0],
            name=row[1],
            local_path=row[2],
            source_type=row[3],
            github_url=row[4],
            indexing_status=row[5],
            git_available=bool(row[6]),
        )

        detected_git = self.is_git_repository(repository.local_path)

        if repository.git_available != detected_git:
            repository.git_available = detected_git

            with self._connect() as connection:
                connection.execute(
                    """
                    UPDATE repositories
                    SET git_available = ?
                    WHERE id = ?
                    """,
                    (int(detected_git), repository.id),
                )
                connection.commit()

        return repository

    def get_saved_repositories(self) -> list[Repository]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    name,
                    local_path,
                    source_type,
                    github_url,
                    indexing_status,
                    git_available
                FROM repositories
                ORDER BY name
                """
            ).fetchall()

        repositories = []

        for row in rows:
            repository = Repository(
                id=row[0],
                name=row[1],
                local_path=row[2],
                source_type=row[3],
                github_url=row[4],
                indexing_status=row[5],
                git_available=bool(row[6]),
            )

            detected_git = self.is_git_repository(repository.local_path)

            if repository.git_available != detected_git:
                repository.git_available = detected_git

                with self._connect() as connection:
                    connection.execute(
                        """
                        UPDATE repositories
                        SET git_available = ?
                        WHERE id = ?
                        """,
                        (int(detected_git), repository.id),
                    )
                    connection.commit()

            repositories.append(repository)

        return repositories

    def remove_repository(self, repository_id: str):
        repository = self.get_repository(repository_id)

        if not repository:
            return False

        with self._connect() as connection:
            connection.execute(
                "DELETE FROM repositories WHERE id = ?",
                (repository_id,),
            )
            connection.commit()

        return True

    def set_active_repository(self, repository_id: str):
        repository = self.get_repository(repository_id)

        if not repository:
            raise ValueError(
                f"Repository not found: {repository_id}"
            )

        active_file = self.database_path.parent / "active_repository.txt"
        active_file.write_text(repository_id, encoding="utf-8")

        return repository

    def get_active_repository(self) -> Repository | None:
        active_file = self.database_path.parent / "active_repository.txt"

        if not active_file.exists():
            return None

        repository_id = active_file.read_text(
            encoding="utf-8"
        ).strip()

        if not repository_id:
            return None

        return self.get_repository(repository_id)

    def clear_active_repository(self):
        active_file = self.database_path.parent / "active_repository.txt"

        if active_file.exists():
            active_file.unlink()

    def update_indexing_status(
        self,
        repository_id: str,
        status: str,
    ):
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE repositories
                SET indexing_status = ?
                WHERE id = ?
                """,
                (status, repository_id),
            )
            connection.commit()

    def get_indexing_status(
        self,
        repository_id: str,
    ) -> str | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT indexing_status
                FROM repositories
                WHERE id = ?
                """,
                (repository_id,),
            ).fetchone()

        return row[0] if row else None

    def get_repository_summary(
        self,
        repository_id: str,
    ) -> dict | None:
        repository = self.get_repository(repository_id)

        if not repository:
            return None

        return {
            "id": repository.id,
            "name": repository.name,
            "local_path": repository.local_path,
            "source_type": repository.source_type,
            "github_url": repository.github_url,
            "indexing_status": repository.indexing_status,
            "git_available": repository.git_available,
        }

    def get_repository_stats(
        self,
        repository_id: str,
    ) -> dict | None:
        repository = self.get_repository(repository_id)

        if not repository:
            return None

        repository_path = Path(repository.local_path)

        if not repository_path.exists():
            return {
                "id": repository.id,
                "name": repository.name,
                "local_path": repository.local_path,
                "source_type": repository.source_type,
                "github_url": repository.github_url,
                "file_count": 0,
                "indexed_chunks": 0,
                "indexing_status": repository.indexing_status,
                "git_available": repository.git_available,
            }

        file_count = sum(
            1
            for path in repository_path.rglob("*")
            if path.is_file()
            and ".git" not in path.parts
        )

        try:
            vector_store = CodeVectorStore(
                repository_path=str(repository_path)
            )
            indexed_chunks = vector_store.count()
        except Exception:
            indexed_chunks = 0

        return {
            "id": repository.id,
            "name": repository.name,
            "local_path": repository.local_path,
            "source_type": repository.source_type,
            "github_url": repository.github_url,
            "file_count": file_count,
            "indexed_chunks": indexed_chunks,
            "indexing_status": repository.indexing_status,
            "git_available": repository.git_available,
        }

    def delete_repository_files(self, repository_id: str):
        repository = self.get_repository(repository_id)

        if not repository:
            raise ValueError(
                f"Repository not found: {repository_id}"
            )

        repository_path = Path(repository.local_path).resolve()

        if not repository_path.exists():
            return

        if self.repositories_root.resolve() not in repository_path.parents:
            raise ValueError(
                "Refusing to delete a repository outside the repositories directory."
            )

        shutil.rmtree(repository_path)