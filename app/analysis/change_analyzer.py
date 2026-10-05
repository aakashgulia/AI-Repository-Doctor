from __future__ import annotations

import ast
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from app.analysis.git_analyzer import GitAnalyzer


@dataclass
class CodeSymbol:
    """A function or class discovered through Python AST analysis."""

    name: str
    symbol_type: str
    start_line: int
    end_line: int


@dataclass
class ChangedSymbol:
    """A Python function/class affected by a Git change."""

    file_path: str
    name: str
    symbol_type: str
    change_type: str
    old_start_line: int | None
    old_end_line: int | None
    new_start_line: int | None
    new_end_line: int | None
    deleted_lines: list[int]
    added_lines: list[int]


@dataclass
class ChangeAnalysis:
    """Structured analysis of changed files and Python symbols."""

    from_commit: str
    to_commit: str
    changed_files: list[dict]
    changed_symbols: list[ChangedSymbol]


class ChangeAnalyzer:
    """
    Analyze Git changes and identify changed Python functions/classes.

    Symbol changes are classified as:

        added
        deleted
        modified

    Blank-line-only changes are ignored.

    Deleted lines are mapped against the old commit AST.
    Added lines are mapped against the new commit AST.
    """

    HUNK_PATTERN = re.compile(
        r"@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@"
    )

    def __init__(self, repository_path: str):
        self.repository_path = Path(repository_path).resolve()
        self.git_analyzer = GitAnalyzer(str(self.repository_path))

    @staticmethod
    def _parse_python_symbols(source: str) -> list[CodeSymbol]:
        """Extract functions and classes from Python source."""

        if not source.strip():
            return []

        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        symbols: list[CodeSymbol] = []

        for node in ast.walk(tree):
            if isinstance(
                node,
                (ast.FunctionDef, ast.AsyncFunctionDef),
            ):
                symbols.append(
                    CodeSymbol(
                        name=node.name,
                        symbol_type="function",
                        start_line=node.lineno,
                        end_line=node.end_lineno or node.lineno,
                    )
                )

            elif isinstance(node, ast.ClassDef):
                symbols.append(
                    CodeSymbol(
                        name=node.name,
                        symbol_type="class",
                        start_line=node.lineno,
                        end_line=node.end_lineno or node.lineno,
                    )
                )

        return sorted(
            symbols,
            key=lambda symbol: (
                symbol.start_line,
                symbol.end_line,
                symbol.name,
            ),
        )

    def _read_file_at_commit(
        self,
        commit_ref: str,
        file_path: str,
    ) -> str:
        """Read a repository file from a specific Git commit."""

        commit = self.git_analyzer.repo.commit(commit_ref)

        try:
            blob = commit.tree / file_path
        except KeyError:
            return ""

        return blob.data_stream.read().decode(
            "utf-8",
            errors="replace",
        )

    @staticmethod
    def _symbol_for_line(
        symbols: list[CodeSymbol],
        line_number: int,
    ) -> CodeSymbol | None:
        """Find the smallest AST symbol containing a line."""

        matches = [
            symbol
            for symbol in symbols
            if symbol.start_line <= line_number <= symbol.end_line
        ]

        if not matches:
            return None

        return min(
            matches,
            key=lambda symbol: (
                symbol.end_line - symbol.start_line,
                symbol.start_line,
            ),
        )

    @staticmethod
    def _parse_changed_lines(
        diff_text: str,
    ) -> tuple[list[int], list[int]]:
        """
        Parse actual deleted and added line numbers.

        Blank-line-only changes are ignored.

        Returns:
            deleted_lines:
                Line numbers from the old version.

            added_lines:
                Line numbers from the new version.
        """

        deleted_lines: list[int] = []
        added_lines: list[int] = []

        old_line = 0
        new_line = 0
        in_hunk = False

        for line in diff_text.splitlines():
            hunk_match = ChangeAnalyzer.HUNK_PATTERN.match(line)

            if hunk_match:
                old_line = int(hunk_match.group(1))
                new_line = int(hunk_match.group(3))
                in_hunk = True
                continue

            if not in_hunk:
                continue

            if line.startswith("\\ No newline"):
                continue

            if line.startswith("+"):
                if not line.startswith("+++"):
                    if line[1:].strip():
                        added_lines.append(new_line)

                    new_line += 1

                continue

            if line.startswith("-"):
                if not line.startswith("---"):
                    if line[1:].strip():
                        deleted_lines.append(old_line)

                    old_line += 1

                continue

            old_line += 1
            new_line += 1

        return deleted_lines, added_lines

    @staticmethod
    def _symbol_key(
        symbol: CodeSymbol,
    ) -> tuple[str, str]:
        """Return a stable symbol identity."""

        return (
            symbol.symbol_type,
            symbol.name,
        )

    @staticmethod
    def _lines_for_symbol(
        lines: list[int],
        symbol: CodeSymbol,
    ) -> list[int]:
        """Return changed lines belonging to a symbol."""

        return [
            line
            for line in lines
            if symbol.start_line <= line <= symbol.end_line
        ]

    def _get_file_diff(
        self,
        from_commit: str,
        to_commit: str,
        file_path: str,
    ) -> str:
        """
        Return the patch representing:

            from_commit -> to_commit

        IMPORTANT:
        The old commit must be the left side of the diff and the
        new commit must be the right side.
        """

        old_commit = self.git_analyzer.repo.commit(from_commit)
        new_commit = self.git_analyzer.repo.commit(to_commit)

        # Correct direction:
        #
        #     from_commit -> to_commit
        #
        # Therefore:
        #
        #     old_commit.diff(new_commit)
        #
        diffs = old_commit.diff(
            new_commit,
            paths=file_path,
            create_patch=True,
        )

        parts: list[str] = []

        for diff in diffs:
            if diff.diff:
                parts.append(
                    diff.diff.decode(
                        "utf-8",
                        errors="replace",
                    )
                )

        return "\n".join(parts)

    def _analyze_changed_file(
        self,
        from_commit: str,
        to_commit: str,
        file_info: dict,
    ) -> list[ChangedSymbol]:
        """Map actual Git changes to Python functions/classes."""

        file_path = file_info["path"]

        if not file_path.endswith(".py"):
            return []

        diff_text = self._get_file_diff(
            from_commit=from_commit,
            to_commit=to_commit,
            file_path=file_path,
        )

        if not diff_text:
            return []

        deleted_lines, added_lines = self._parse_changed_lines(
            diff_text
        )

        if not deleted_lines and not added_lines:
            return []

        old_source = self._read_file_at_commit(
            commit_ref=from_commit,
            file_path=file_path,
        )

        new_source = self._read_file_at_commit(
            commit_ref=to_commit,
            file_path=file_path,
        )

        old_symbols = self._parse_python_symbols(old_source)
        new_symbols = self._parse_python_symbols(new_source)

        old_by_key = {
            self._symbol_key(symbol): symbol
            for symbol in old_symbols
        }

        new_by_key = {
            self._symbol_key(symbol): symbol
            for symbol in new_symbols
        }

        deleted_symbol_keys: set[tuple[str, str]] = set()

        for line_number in deleted_lines:
            symbol = self._symbol_for_line(
                symbols=old_symbols,
                line_number=line_number,
            )

            if symbol:
                deleted_symbol_keys.add(
                    self._symbol_key(symbol)
                )

        added_symbol_keys: set[tuple[str, str]] = set()

        for line_number in added_lines:
            symbol = self._symbol_for_line(
                symbols=new_symbols,
                line_number=line_number,
            )

            if symbol:
                added_symbol_keys.add(
                    self._symbol_key(symbol)
                )

        results: list[ChangedSymbol] = []

        # ---------------------------------------------------------
        # Modified symbols
        # ---------------------------------------------------------

        modified_keys = (
            deleted_symbol_keys & set(new_by_key)
        ) | (
            added_symbol_keys & set(old_by_key)
        )

        for key in sorted(modified_keys):
            old_symbol = old_by_key[key]
            new_symbol = new_by_key[key]

            results.append(
                ChangedSymbol(
                    file_path=file_path,
                    name=key[1],
                    symbol_type=key[0],
                    change_type="modified",
                    old_start_line=old_symbol.start_line,
                    old_end_line=old_symbol.end_line,
                    new_start_line=new_symbol.start_line,
                    new_end_line=new_symbol.end_line,
                    deleted_lines=self._lines_for_symbol(
                        deleted_lines,
                        old_symbol,
                    ),
                    added_lines=self._lines_for_symbol(
                        added_lines,
                        new_symbol,
                    ),
                )
            )

        # ---------------------------------------------------------
        # Deleted symbols
        # ---------------------------------------------------------

        deleted_keys = (
            deleted_symbol_keys
            - set(new_by_key)
        )

        for key in sorted(deleted_keys):
            old_symbol = old_by_key[key]

            results.append(
                ChangedSymbol(
                    file_path=file_path,
                    name=key[1],
                    symbol_type=key[0],
                    change_type="deleted",
                    old_start_line=old_symbol.start_line,
                    old_end_line=old_symbol.end_line,
                    new_start_line=None,
                    new_end_line=None,
                    deleted_lines=self._lines_for_symbol(
                        deleted_lines,
                        old_symbol,
                    ),
                    added_lines=[],
                )
            )

        # ---------------------------------------------------------
        # Added symbols
        # ---------------------------------------------------------

        added_keys = (
            added_symbol_keys
            - set(old_by_key)
        )

        for key in sorted(added_keys):
            new_symbol = new_by_key[key]

            results.append(
                ChangedSymbol(
                    file_path=file_path,
                    name=key[1],
                    symbol_type=key[0],
                    change_type="added",
                    old_start_line=None,
                    old_end_line=None,
                    new_start_line=new_symbol.start_line,
                    new_end_line=new_symbol.end_line,
                    deleted_lines=[],
                    added_lines=self._lines_for_symbol(
                        added_lines,
                        new_symbol,
                    ),
                )
            )

        return sorted(
            results,
            key=lambda item: (
                item.file_path,
                (
                    item.new_start_line
                    if item.new_start_line is not None
                    else item.old_start_line or 0
                ),
                item.name,
            ),
        )

    def analyze(
        self,
        from_commit: str,
        to_commit: str,
    ) -> ChangeAnalysis:
        """Analyze changed files and identify affected symbols."""

        comparison = self.git_analyzer.compare_commits_dict(
            from_commit=from_commit,
            to_commit=to_commit,
        )

        changed_symbols: list[ChangedSymbol] = []

        for file_info in comparison["changed_files"]:
            changed_symbols.extend(
                self._analyze_changed_file(
                    from_commit=from_commit,
                    to_commit=to_commit,
                    file_info=file_info,
                )
            )

        return ChangeAnalysis(
            from_commit=from_commit,
            to_commit=to_commit,
            changed_files=comparison["changed_files"],
            changed_symbols=changed_symbols,
        )

    def analyze_dict(
        self,
        from_commit: str,
        to_commit: str,
    ) -> dict:
        """Return a JSON-serializable change analysis."""

        return asdict(
            self.analyze(
                from_commit=from_commit,
                to_commit=to_commit,
            )
        )


if __name__ == "__main__":
    analyzer = ChangeAnalyzer(
        "data/repositories/demo-task-api"
    )

    result = analyzer.analyze_dict(
        from_commit="98efbb9",
        to_commit="34cac1f",
    )

    print("Changed symbols:")

    for symbol in result["changed_symbols"]:
        print(symbol)