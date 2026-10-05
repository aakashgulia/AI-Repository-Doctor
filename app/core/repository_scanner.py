from pathlib import Path


IGNORED_DIRECTORIES = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".idea",
    ".vscode",
    "dist",
    "build",
}


IGNORED_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
}


SUPPORTED_EXTENSIONS = {
    # Python
    ".py",

    # JavaScript / TypeScript
    ".js",
    ".jsx",
    ".ts",
    ".tsx",

    # Java / C / C++ / Go / Rust
    ".java",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".go",
    ".rs",

    # Other programming languages
    ".php",
    ".rb",
    ".sql",

    # Web
    ".html",
    ".css",

    # Configuration / data
    ".json",
    ".yaml",
    ".yml",

    # Documentation
    ".md",

    # Jupyter notebooks
    ".ipynb",

    # Text
    ".txt",

    # Data files
    ".csv",
}


def scan_repository(repository_path: str) -> list[dict]:
    root = Path(repository_path)

    if not root.exists():
        raise FileNotFoundError(
            f"Repository path does not exist: {repository_path}"
        )

    if not root.is_dir():
        raise NotADirectoryError(
            f"Repository path is not a directory: {repository_path}"
        )

    files = []

    for file_path in root.rglob("*"):
        if not file_path.is_file():
            continue

        if any(
            directory in IGNORED_DIRECTORIES
            for directory in file_path.parts
        ):
            continue

        if file_path.name in IGNORED_FILES:
            continue

        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        try:
            content = file_path.read_text(
                encoding="utf-8",
                errors="ignore",
            )
        except Exception:
            continue

        relative_path = file_path.relative_to(root)

        files.append(
            {
                "path": str(relative_path),
                "extension": file_path.suffix.lower(),
                "content": content,
                "size": len(content),
            }
        )

    return files