from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from git import BadName, InvalidGitRepositoryError, NoSuchPathError, Repo
from git.diff import Diff


@dataclass
class CommitInfo:
    """Metadata describing a Git commit."""

    hash: str
    short_hash: str
    author: str
    date: str
    message: str


@dataclass
class ChangedFile:
    """Information about a file changed between two commits."""

    path: str
    old_path: str | None
    new_path: str | None
    change_type: str
    additions: int
    deletions: int


@dataclass
class CommitComparison:
    """Structured Git comparison between two commits."""

    from_commit: CommitInfo
    to_commit: CommitInfo
    changed_files: list[ChangedFile]
    diff: str


class GitAnalyzer:
    """Analyze Git history and changes for a repository."""

    def __init__(self, repository_path: str):
        self.repository_path = Path(repository_path).resolve()

        try:
            self.repo = Repo(self.repository_path)
        except NoSuchPathError as error:
            raise ValueError(
                f"Repository path does not exist: {self.repository_path}"
            ) from error
        except InvalidGitRepositoryError as error:
            raise ValueError(
                f"Not a Git repository: {self.repository_path}"
            ) from error

        if self.repo.bare:
            raise ValueError(
                f"Git repository is bare and cannot be analyzed: "
                f"{self.repository_path}"
            )

    def _get_commit(self, commit_ref: str):
        """Resolve a commit reference to a Git commit object."""

        if not commit_ref or not commit_ref.strip():
            raise ValueError("Commit reference cannot be empty.")

        try:
            return self.repo.commit(commit_ref.strip())
        except (BadName, ValueError) as error:
            raise ValueError(
                f"Invalid Git commit reference: {commit_ref}"
            ) from error

    @staticmethod
    def _commit_info(commit) -> CommitInfo:
        """Convert a GitPython commit object into structured metadata."""

        return CommitInfo(
            hash=commit.hexsha,
            short_hash=commit.hexsha[:7],
            author=commit.author.name,
            date=commit.committed_datetime.isoformat(),
            message=commit.message.strip(),
        )

    @staticmethod
    def _decode_diff(diff_data: bytes | str | None) -> str:
        """Safely decode a Git diff."""

        if not diff_data:
            return ""

        if isinstance(diff_data, bytes):
            return diff_data.decode("utf-8", errors="replace")

        return str(diff_data)

    @staticmethod
    def _count_changes(diff_data: bytes | str | None) -> tuple[int, int]:
        """
        Count added and deleted lines in a patch.

        Diff headers such as +++ and --- are excluded.
        """

        diff_text = GitAnalyzer._decode_diff(diff_data)

        if not diff_text:
            return 0, 0

        additions = 0
        deletions = 0

        for line in diff_text.splitlines():
            if line.startswith("+++") or line.startswith("---"):
                continue

            if line.startswith("+"):
                additions += 1
            elif line.startswith("-"):
                deletions += 1

        return additions, deletions

    def get_commit_history(self, limit: int | None = 20) -> list[CommitInfo]:
        """
        Return commits from newest to oldest.

        Args:
            limit: Maximum number of commits to return.
                   Use None for the complete history.
        """

        commits = self.repo.iter_commits()

        if limit is not None:
            if limit <= 0:
                raise ValueError(
                    "Commit history limit must be greater than zero."
                )

            commits = list(commits)[:limit]

        return [self._commit_info(commit) for commit in commits]

    def get_commit(self, commit_ref: str) -> CommitInfo:
        """Return metadata for a single commit."""

        commit = self._get_commit(commit_ref)
        return self._commit_info(commit)

    def get_changed_files(
        self,
        from_commit: str,
        to_commit: str,
    ) -> list[ChangedFile]:
        """
        Return files changed when moving from from_commit to to_commit.

        The comparison direction is explicitly:

            from_commit -> to_commit

        GitPython must therefore compare the old commit against the
        new commit:

            old_commit.diff(new_commit)
        """

        old_commit = self._get_commit(from_commit)
        new_commit = self._get_commit(to_commit)

        # IMPORTANT:
        # old_commit.diff(new_commit) produces the patch representing
        # the transition:
        #
        #     from_commit -> to_commit
        #
        # This direction is required for correct added/deleted line
        # analysis later.
        diffs = old_commit.diff(
            new_commit,
            create_patch=True,
        )

        return [
            self._changed_file_from_diff(diff)
            for diff in diffs
        ]

    @staticmethod
    def _changed_file_from_diff(diff: Diff) -> ChangedFile:
        """Convert a GitPython Diff object into structured file information."""

        change_type = diff.change_type or "M"

        old_path = diff.a_path
        new_path = diff.b_path

        if change_type == "A":
            path = new_path
            old_path = None

        elif change_type == "D":
            path = old_path
            new_path = None

        elif change_type == "R":
            path = new_path

        else:
            path = new_path or old_path

        additions, deletions = GitAnalyzer._count_changes(
            diff.diff
        )

        return ChangedFile(
            path=path or "",
            old_path=old_path,
            new_path=new_path,
            change_type=change_type,
            additions=additions,
            deletions=deletions,
        )

    def get_diff(
        self,
        from_commit: str,
        to_commit: str,
    ) -> str:
        """
        Return the complete patch for:

            from_commit -> to_commit
        """

        old_commit = self._get_commit(from_commit)
        new_commit = self._get_commit(to_commit)

        # IMPORTANT:
        # Keep the same direction as get_changed_files().
        diffs = old_commit.diff(
            new_commit,
            create_patch=True,
        )

        diff_parts = [
            self._decode_diff(diff.diff)
            for diff in diffs
            if diff.diff
        ]

        return "\n".join(diff_parts)

    def compare_commits(
        self,
        from_commit: str,
        to_commit: str,
    ) -> CommitComparison:
        """Compare two commits in explicit from -> to direction."""

        from_info = self.get_commit(from_commit)
        to_info = self.get_commit(to_commit)

        changed_files = self.get_changed_files(
            from_commit=from_commit,
            to_commit=to_commit,
        )

        diff = self.get_diff(
            from_commit=from_commit,
            to_commit=to_commit,
        )

        return CommitComparison(
            from_commit=from_info,
            to_commit=to_info,
            changed_files=changed_files,
            diff=diff,
        )

    def compare_commits_dict(
        self,
        from_commit: str,
        to_commit: str,
    ) -> dict:
        """Return a JSON-serializable comparison dictionary."""

        comparison = self.compare_commits(
            from_commit=from_commit,
            to_commit=to_commit,
        )

        return asdict(comparison)


if __name__ == "__main__":
    analyzer = GitAnalyzer(
        "data/repositories/demo-task-api"
    )

    result = analyzer.compare_commits_dict(
        from_commit="98efbb9",
        to_commit="34cac1f",
    )

    print("From:", result["from_commit"]["short_hash"])
    print("To:", result["to_commit"]["short_hash"])

    print("Changed files:")

    for changed_file in result["changed_files"]:
        print(
            f"  {changed_file['change_type']} "
            f"{changed_file['path']} "
            f"(+{changed_file['additions']} "
            f"-{changed_file['deletions']})"
        )

    print("\nDiff:")
    print(result["diff"])