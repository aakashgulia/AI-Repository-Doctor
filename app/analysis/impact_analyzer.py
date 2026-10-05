from __future__ import annotations

import ast
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class FunctionCall:
    """A function that calls another function."""

    file_path: str
    function_name: str
    called_name: str
    line_number: int


@dataclass
class ModuleImport:
    """A Python file importing another module."""

    file_path: str
    imported_module: str
    line_number: int


class ImpactAnalyzer:
    """
    Analyze Python dependencies around changed symbols.

    This analyzer uses Python AST rather than LLM inference.

    It identifies:
        1. Functions that call changed functions.
        2. Files that import modules containing changed symbols.
        3. Tests that exercise changed functions.
    """

    def __init__(self, repository_path: str):
        self.repository_path = Path(repository_path).resolve()

        if not self.repository_path.exists():
            raise ValueError(
                f"Repository path does not exist: "
                f"{self.repository_path}"
            )

    @staticmethod
    def _get_python_files(
        repository_path: Path,
    ) -> list[Path]:
        """Return Python source files while ignoring generated folders."""

        ignored_directories = {
            ".git",
            ".venv",
            "venv",
            "__pycache__",
            "node_modules",
            ".pytest_cache",
        }

        python_files: list[Path] = []

        for path in repository_path.rglob("*.py"):
            if any(
                part in ignored_directories
                for part in path.parts
            ):
                continue

            python_files.append(path)

        return sorted(python_files)

    @staticmethod
    def _read_python_file(path: Path) -> str:
        """Read Python source safely."""

        return path.read_text(
            encoding="utf-8",
            errors="replace",
        )

    @staticmethod
    def _attribute_name(node: ast.AST) -> str | None:
        """Extract the final name from a call target."""

        if isinstance(node, ast.Name):
            return node.id

        if isinstance(node, ast.Attribute):
            return node.attr

        return None

    def _find_function_calls(
        self,
        file_path: Path,
        target_function_names: set[str],
    ) -> list[FunctionCall]:
        """Find functions calling any target function."""

        source = self._read_python_file(file_path)

        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        relative_path = file_path.relative_to(
            self.repository_path
        ).as_posix()

        calls: list[FunctionCall] = []

        for node in ast.walk(tree):
            if not isinstance(
                node,
                (ast.FunctionDef, ast.AsyncFunctionDef),
            ):
                continue

            for child in ast.walk(node):
                if not isinstance(child, ast.Call):
                    continue

                called_name = self._attribute_name(child.func)

                if called_name not in target_function_names:
                    continue

                calls.append(
                    FunctionCall(
                        file_path=relative_path,
                        function_name=node.name,
                        called_name=called_name or "",
                        line_number=child.lineno,
                    )
                )

        return calls

    def _find_module_imports(
        self,
        file_path: Path,
        target_module: str,
    ) -> list[ModuleImport]:
        """Find files importing a target Python module."""

        source = self._read_python_file(file_path)

        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        relative_path = file_path.relative_to(
            self.repository_path
        ).as_posix()

        imports: list[ModuleImport] = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_module = alias.name

                    if (
                        imported_module == target_module
                        or imported_module.startswith(
                            target_module + "."
                        )
                    ):
                        imports.append(
                            ModuleImport(
                                file_path=relative_path,
                                imported_module=imported_module,
                                line_number=node.lineno,
                            )
                        )

            elif isinstance(node, ast.ImportFrom):
                imported_module = node.module or ""

                if (
                    imported_module == target_module
                    or imported_module.startswith(
                        target_module + "."
                    )
                ):
                    imports.append(
                        ModuleImport(
                            file_path=relative_path,
                            imported_module=imported_module,
                            line_number=node.lineno,
                        )
                    )

        return imports

    @staticmethod
    def _module_name_from_file(
        file_path: str,
    ) -> str:
        """Convert a Python file path into a module-like name."""

        normalized = file_path.replace("\\", "/")

        if normalized.endswith(".py"):
            normalized = normalized[:-3]

        if normalized.endswith("/__init__"):
            normalized = normalized[:-9]

        return normalized.replace("/", ".")

    @staticmethod
    def _is_test_file(file_path: str) -> bool:
        """Return True when a path follows common pytest test naming."""

        path = file_path.replace("\\", "/")
        name = Path(path).name

        return (
            name.startswith("test_")
            or name.endswith("_test.py")
            or "/tests/" in f"/{path}/"
            or path.startswith("tests/")
        )

    def _find_related_tests(
        self,
        function_calls: list[FunctionCall],
    ) -> list[dict]:
        """
        Identify tests that directly call changed functions.
        """

        related_tests: list[dict] = []

        for call in function_calls:
            if not self._is_test_file(call.file_path):
                continue

            if not call.function_name.startswith("test_"):
                continue

            related_tests.append(
                {
                    "file_path": call.file_path,
                    "test_name": call.function_name,
                    "calls": call.called_name,
                    "line_number": call.line_number,
                }
            )

        return related_tests

    def analyze_changed_symbol(
        self,
        file_path: str,
        function_name: str,
    ) -> dict:
        """
        Analyze impact for one changed function.
        """

        normalized_file = Path(file_path)

        absolute_file = (
            self.repository_path / normalized_file
        ).resolve()

        try:
            absolute_file.relative_to(
                self.repository_path
            )
        except ValueError as error:
            raise ValueError(
                "File path must be inside the repository."
            ) from error

        target_module = self._module_name_from_file(
            file_path
        )

        target_function_names = {
            function_name
        }

        function_calls: list[FunctionCall] = []
        module_imports: list[ModuleImport] = []

        for python_file in self._get_python_files(
            self.repository_path
        ):
            function_calls.extend(
                self._find_function_calls(
                    file_path=python_file,
                    target_function_names=target_function_names,
                )
            )

            if python_file.resolve() != absolute_file:
                module_imports.extend(
                    self._find_module_imports(
                        file_path=python_file,
                        target_module=target_module,
                    )
                )

        function_calls = [
            call
            for call in function_calls
            if not (
                call.file_path == file_path
                and call.function_name == function_name
            )
        ]

        related_tests = self._find_related_tests(
            function_calls
        )

        return {
            "target": {
                "file_path": file_path,
                "function_name": function_name,
                "module": target_module,
            },
            "function_calls": [
                asdict(call)
                for call in function_calls
            ],
            "module_imports": [
                asdict(import_item)
                for import_item in module_imports
            ],
            "related_tests": related_tests,
        }

    def analyze_changed_symbols(
        self,
        changed_symbols: list[dict],
    ) -> dict:
        """
        Analyze the complete changed-symbol list produced by
        ChangeAnalyzer.

        Only functions are currently analyzed for call relationships.
        Classes are preserved in the input but skipped here because
        class-level impact requires separate inheritance/reference
        analysis.
        """

        analyses: list[dict] = []

        for symbol in changed_symbols:
            if symbol.get("symbol_type") != "function":
                continue

            file_path = symbol.get("file_path")
            function_name = symbol.get("name")

            if not file_path or not function_name:
                continue

            analyses.append(
                self.analyze_changed_symbol(
                    file_path=file_path,
                    function_name=function_name,
                )
            )

        return {
            "changed_symbols": changed_symbols,
            "symbol_impacts": analyses,
        }


if __name__ == "__main__":
    analyzer = ImpactAnalyzer(
        "data/repositories/demo-task-api"
    )

    changed_symbols = [
        {
            "file_path": "app/tasks.py",
            "name": "complete_task",
            "symbol_type": "function",
            "change_type": "modified",
        },
        {
            "file_path": "tests/test_tasks.py",
            "name": "test_complete_task",
            "symbol_type": "function",
            "change_type": "modified",
        },
    ]

    result = analyzer.analyze_changed_symbols(
        changed_symbols
    )

    print("Changed symbols:")
    for symbol in result["changed_symbols"]:
        print(symbol)

    print("\nSymbol impacts:")

    for impact in result["symbol_impacts"]:
        print("\nTarget:")
        print(impact["target"])

        print("Function calls:")
        for call in impact["function_calls"]:
            print(call)

        print("Module imports:")
        for import_item in impact["module_imports"]:
            print(import_item)

        print("Related tests:")
        for test in impact["related_tests"]:
            print(test)