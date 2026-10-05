from __future__ import annotations

import re
import subprocess
from pathlib import Path


PROJECT_PYTHON = Path(
    r"D:\AI-Repository-Doctor\.venv\Scripts\python.exe"
)


class TestRunner:
    """Run a repository's pytest suite and return structured results."""

    def _validate_repository(
        self,
        repository_path: str,
    ) -> Path:
        path = Path(repository_path).expanduser().resolve()

        if not path.exists():
            raise ValueError(
                f"Repository path does not exist: {path}"
            )

        if not path.is_dir():
            raise ValueError(
                f"Repository path is not a directory: {path}"
            )

        if not PROJECT_PYTHON.exists():
            raise ValueError(
                f"Project Python executable not found: {PROJECT_PYTHON}"
            )

        return path

    @staticmethod
    def _parse_results(
        output: str,
        return_code: int,
    ) -> dict:
        passed_match = re.search(
            r"(\d+)\s+passed",
            output,
            re.IGNORECASE,
        )

        failed_match = re.search(
            r"(\d+)\s+failed",
            output,
            re.IGNORECASE,
        )

        skipped_match = re.search(
            r"(\d+)\s+skipped",
            output,
            re.IGNORECASE,
        )

        error_match = re.search(
            r"(\d+)\s+error",
            output,
            re.IGNORECASE,
        )

        passed = (
            int(passed_match.group(1))
            if passed_match
            else 0
        )

        failed = (
            int(failed_match.group(1))
            if failed_match
            else 0
        )

        skipped = (
            int(skipped_match.group(1))
            if skipped_match
            else 0
        )

        errors = (
            int(error_match.group(1))
            if error_match
            else 0
        )

        total = passed + failed + skipped + errors

        return {
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "errors": errors,
            "total": total,
            "pass_rate": (
                round((passed / total) * 100, 1)
                if total
                else 0.0
            ),
            "exit_code": return_code,
            "output": output,
        }

    def run(
        self,
        repository_path: str,
    ) -> dict:
        """
        Run the complete pytest suite.
        """

        path = self._validate_repository(
            repository_path
        )

        result = subprocess.run(
            [
                str(PROJECT_PYTHON),
                "-m",
                "pytest",
                "-q",
            ],
            cwd=str(path),
            capture_output=True,
            text=True,
            timeout=120,
        )

        output = "\n".join(
            part
            for part in (
                result.stdout.strip(),
                result.stderr.strip(),
            )
            if part
        )

        return self._parse_results(
            output=output,
            return_code=result.returncode,
        )

    def run_selected(
        self,
        repository_path: str,
        test_targets: list[str],
    ) -> dict:
        """
        Run only the selected pytest node IDs.

        Example target:

            tests/test_tasks.py::test_complete_task
        """

        path = self._validate_repository(
            repository_path
        )

        cleaned_targets = [
            target.strip()
            for target in test_targets
            if target and target.strip()
        ]

        if not cleaned_targets:
            raise ValueError(
                "At least one test target is required."
            )

        result = subprocess.run(
            [
                str(PROJECT_PYTHON),
                "-m",
                "pytest",
                "-q",
                *cleaned_targets,
            ],
            cwd=str(path),
            capture_output=True,
            text=True,
            timeout=120,
        )

        output = "\n".join(
            part
            for part in (
                result.stdout.strip(),
                result.stderr.strip(),
            )
            if part
        )

        results = self._parse_results(
            output=output,
            return_code=result.returncode,
        )

        results["selected_tests"] = cleaned_targets

        return results