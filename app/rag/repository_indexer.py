from pathlib import Path

from app.core.repository_manager import RepositoryManager
from app.core.repository_scanner import scan_repository
from app.rag.code_chunker import chunk_code
from app.rag.vector_store import CodeVectorStore


def index_repository(repository_path: str) -> dict:
    """
    Index a repository into its isolated vector store.

    Re-indexing replaces the repository's previous vector collection
    so deleted, changed, or outdated chunks cannot remain in retrieval.
    """
    repository_path = str(Path(repository_path).resolve())

    repository_manager = RepositoryManager()

    repository = repository_manager.get_repository_by_path(repository_path)

    if not repository:
        repository = repository_manager.create_repository(
            repository_path=repository_path,
            source_type="local",
        )

    repository_id = repository.id

    repository_manager.update_indexing_status(
        repository_id,
        "INDEXING",
    )

    try:
        files = scan_repository(repository_path)

        total_files = len(files)

        vector_store = CodeVectorStore(
            repository_path=repository_path
        )

        # Clear the repository's existing vector collection before
        # rebuilding it. This prevents stale chunks from previous
        # indexing runs from being retrieved.
        vector_store.clear()

        total_chunks = 0

        for file in files:
            chunks = chunk_code(
                file_path=file["path"],
                content=file["content"],
            )

            if not chunks:
                continue

            indexed = vector_store.add_chunks(chunks)

            total_chunks += indexed

        repository_manager.update_indexing_status(
            repository_id,
            "INDEXED",
        )

        return {
            "status": "success",
            "repository": repository_path,
            "repository_id": repository_id,
            "files_scanned": total_files,
            "chunks_indexed": total_chunks,
        }

    except Exception:
        repository_manager.update_indexing_status(
            repository_id,
            "FAILED",
        )
        raise