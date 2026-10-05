from __future__ import annotations

import csv
import io
import json
from pathlib import Path


DEFAULT_CHUNK_SIZE = 1200
DEFAULT_OVERLAP = 200

# Large tabular files should not be embedded row-by-row.
MAX_CSV_SAMPLE_ROWS = 10

# Keep notebook outputs from dominating the RAG index.
MAX_NOTEBOOK_OUTPUT_CHARS = 1200


def _chunk_text(
    file_path: str,
    content: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
    start_chunk_id: int = 0,
) -> list[dict]:
    """Split text into overlapping chunks."""

    if not content.strip():
        return []

    if overlap >= chunk_size:
        raise ValueError(
            "overlap must be smaller than chunk_size"
        )

    chunks = []
    start = 0
    chunk_number = start_chunk_id

    while start < len(content):
        end = min(
            start + chunk_size,
            len(content),
        )

        chunk_text = content[start:end]

        chunks.append(
            {
                "file_path": str(Path(file_path)),
                "chunk_id": chunk_number,
                "start_char": start,
                "end_char": end,
                "content": chunk_text,
            }
        )

        chunk_number += 1

        if end >= len(content):
            break

        start = end - overlap

    return chunks


def _join_source(source) -> str:
    """Normalize a notebook cell source into text."""

    if isinstance(source, list):
        return "".join(source)

    if isinstance(source, str):
        return source

    return ""


def _extract_notebook_content(
    file_path: str,
    content: str,
) -> str:
    """
    Convert a Jupyter notebook from raw JSON into
    meaningful repository evidence.

    Only code and markdown cells are included.
    Large cell outputs are intentionally excluded because
    they are generated artifacts rather than source code.
    """

    try:
        notebook = json.loads(content)
    except json.JSONDecodeError:
        # Fall back to normal text chunking if the notebook
        # cannot be parsed.
        return content

    sections = []

    cells = notebook.get("cells", [])

    for index, cell in enumerate(cells):
        cell_type = cell.get(
            "cell_type",
            "unknown",
        )

        source = _join_source(
            cell.get("source", [])
        ).strip()

        if not source:
            continue

        if cell_type == "code":
            sections.append(
                f"# Notebook code cell {index}\n"
                f"{source}"
            )

        elif cell_type == "markdown":
            sections.append(
                f"# Notebook markdown cell {index}\n"
                f"{source}"
            )

    return "\n\n".join(sections)


def _extract_csv_content(
    file_path: str,
    content: str,
) -> str:
    """
    Convert a potentially large CSV file into compact
    retrieval-friendly repository evidence.

    The complete dataset is intentionally NOT embedded.
    Instead we preserve the dataset filename, column names,
    row count when available, and a small representative
    sample.
    """

    try:
        stream = io.StringIO(content)

        reader = csv.reader(stream)

        header = next(reader, [])

        if not header:
            return ""

        sample_rows = []

        for row in reader:
            sample_rows.append(row)

            if len(sample_rows) >= MAX_CSV_SAMPLE_ROWS:
                break

        # Count rows without storing them all.
        row_count = len(sample_rows)

        for _ in reader:
            row_count += 1

        lines = [
            "DATASET FILE",
            f"File: {file_path}",
            "",
            "Columns:",
        ]

        for index, column in enumerate(header, start=1):
            lines.append(
                f"{index}. {column}"
            )

        lines.extend(
            [
                "",
                f"Representative rows included: "
                f"{len(sample_rows)}",
                f"Rows observed in dataset: "
                f"{row_count}",
                "",
                "Sample data:",
            ]
        )

        output = io.StringIO()

        writer = csv.writer(
            output,
            lineterminator="\n",
        )

        writer.writerow(header)

        for row in sample_rows:
            writer.writerow(row)

        lines.append(
            output.getvalue().strip()
        )

        return "\n".join(lines)

    except Exception:
        # If the CSV cannot be parsed safely, preserve a small
        # textual representation rather than failing indexing.
        return (
            f"DATASET FILE\n"
            f"File: {file_path}\n"
            f"Unable to parse CSV structure safely."
        )


def chunk_code(
    file_path: str,
    content: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[dict]:
    """
    Create retrieval chunks using file-aware processing.

    Supported behavior:

    - Jupyter notebooks:
      extract code and markdown cells instead of raw JSON.
    - CSV:
      create compact schema/sample evidence instead of
      embedding the complete dataset.
    - Other files:
      preserve the existing overlapping text chunking behavior.
    """

    if not content.strip():
        return []

    extension = Path(file_path).suffix.lower()

    if extension == ".ipynb":
        notebook_content = _extract_notebook_content(
            file_path=file_path,
            content=content,
        )

        return _chunk_text(
            file_path=file_path,
            content=notebook_content,
            chunk_size=chunk_size,
            overlap=overlap,
        )

    if extension == ".csv":
        csv_content = _extract_csv_content(
            file_path=file_path,
            content=content,
        )

        return _chunk_text(
            file_path=file_path,
            content=csv_content,
            chunk_size=chunk_size,
            overlap=overlap,
        )

    return _chunk_text(
        file_path=file_path,
        content=content,
        chunk_size=chunk_size,
        overlap=overlap,
    )


if __name__ == "__main__":
    repository_path = (
        "data/repositories/demo-task-api"
    )

    from app.core.repository_scanner import (
        scan_repository,
    )

    files = scan_repository(
        repository_path
    )

    for file in files:
        chunks = chunk_code(
            file_path=file["path"],
            content=file["content"],
        )

        print(
            f"{file['path']}: "
            f"{len(chunks)} chunks"
        )