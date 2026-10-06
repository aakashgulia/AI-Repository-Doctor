from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from app.analysis.change_service import ChangeAnalysisService
from app.testing.test_runner import TestRunner


import json
from datetime import datetime, timezone
from pathlib import Path

from app.analysis.change_service import ChangeAnalysisService
from app.testing.test_runner import TestRunner


class AutomatedDoctor:
    """
    Run repository-grounded change analysis and targeted regression tests.

    Pipeline:

        Git commits
            ↓
        Change analysis
            ↓
        Impact analysis
            ↓
        Related test selection
            ↓
        Targeted pytest execution
            ↓
        Structured Doctor report
    """

    def __init__(
        self,
        repository_path: str,
        output_directory: str = "reports/automated-doctor",
    ):
        self.repository_path = Path(
            repository_path
        ).expanduser().resolve()

        if not self.repository_path.exists():
            raise ValueError(
                f"Repository path does not exist: "
                f"{self.repository_path}"
            )

        if not self.repository_path.is_dir():
            raise ValueError(
                f"Repository path is not a directory: "
                f"{self.repository_path}"
            )

        self.output_directory = Path(
            output_directory
        ).expanduser().resolve()

        self.change_service = ChangeAnalysisService(
            str(self.repository_path)
        )

        self.test_runner = TestRunner()

    @staticmethod
    def _extract_test_targets(
        impacts: list[dict],
    ) -> list[str]:
        """
        Extract unique pytest node IDs from impact analysis.
        """

        targets: list[str] = []

        for impact in impacts:
            for test in impact.get(
                "related_tests",
                [],
            ):
                file_path = test.get(
                    "file_path"
                )
                test_name = test.get(
                    "test_name"
                )

                if not file_path or not test_name:
                    continue

                target = (
                    f"{file_path}::{test_name}"
                )

                if target not in targets:
                    targets.append(target)

        return targets

    @staticmethod
    def _build_summary(
        change_analysis: dict,
        test_results: dict,
        selected_tests: list[str],
    ) -> dict:
        changed_files = change_analysis.get(
            "changed_files",
            []
        )

        changed_symbols = change_analysis.get(
            "changed_symbols",
            []
        )

        impacts = change_analysis.get(
            "impacts",
            []
        )

        regression_detected = (
            test_results.get("failed", 0) > 0
            or test_results.get("errors", 0) > 0
        )

        return {
            "changed_files": len(
                changed_files
            ),
            "changed_symbols": len(
                changed_symbols
            ),
            "impact_targets": len(
                impacts
            ),
            "selected_tests": len(
                selected_tests
            ),
            "tests_passed": test_results.get(
                "passed",
                0,
            ),
            "tests_failed": test_results.get(
                "failed",
                0,
            ),
            "tests_skipped": test_results.get(
                "skipped",
                0,
            ),
            "test_errors": test_results.get(
                "errors",
                0,
            ),
            "tests_total": test_results.get(
                "total",
                0,
            ),
            "test_pass_rate": test_results.get(
                "pass_rate",
                0.0,
            ),
            "regression_detected": regression_detected,
        }

    def analyze(
        self,
        from_commit: str,
        to_commit: str,
    ) -> dict:
        """
        Analyze a commit range and run related tests.
        """

        change_analysis = (
            self.change_service.analyze(
                from_commit=from_commit,
                to_commit=to_commit,
            )
        )

        selected_tests = (
            self._extract_test_targets(
                change_analysis["impacts"]
            )
        )

        if selected_tests:
            test_results = (
                self.test_runner.run_selected(
                    repository_path=str(
                        self.repository_path
                    ),
                    test_targets=selected_tests,
                )
            )
        else:
            test_results = {
                "passed": 0,
                "failed": 0,
                "skipped": 0,
                "errors": 0,
                "total": 0,
                "pass_rate": 0.0,
                "exit_code": 0,
                "output": (
                    "No related tests were "
                    "identified by impact analysis."
                ),
                "selected_tests": [],
            }

        summary = self._build_summary(
            change_analysis=change_analysis,
            test_results=test_results,
            selected_tests=selected_tests,
        )

        return {
            "generated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "repository": str(
                self.repository_path
            ),
            "from_commit": change_analysis[
                "from_commit"
            ],
            "to_commit": change_analysis[
                "to_commit"
            ],
            "changed_files": change_analysis[
                "changed_files"
            ],
            "changed_symbols": change_analysis[
                "changed_symbols"
            ],
            "impacts": change_analysis[
                "impacts"
            ],
            "selected_tests": selected_tests,
            "test_results": test_results,
            "summary": summary,
        }

    def write_json(
        self,
        report: dict,
        filename: str = "doctor-report.json",
    ) -> Path:
        """
        Write the structured Doctor report as JSON.
        """

        self.output_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        output_path = (
            self.output_directory / filename
        )

        output_path.write_text(
            json.dumps(
                report,
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        return output_path

    def write_markdown(
        self,
        report: dict,
        filename: str = "doctor-report.md",
    ) -> Path:
        """
        Write a human-readable Doctor report.
        """

        self.output_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        summary = report["summary"]
        test_results = report[
            "test_results"
        ]

        status = (
            "REGRESSION DETECTED"
            if summary["regression_detected"]
            else "NO REGRESSION DETECTED"
        )

        lines = [
            "# Automated Doctor Report",
            "",
            f"**Status:** {status}",
            "",
            f"**Generated:** {report['generated_at']}",
            "",
            "## Repository",
            "",
            f"- Path: `{report['repository']}`",
            f"- From commit: `{report['from_commit']}`",
            f"- To commit: `{report['to_commit']}`",
            "",
            "## Change Analysis",
            "",
            f"- Changed files: "
            f"{summary['changed_files']}",
            f"- Changed symbols: "
            f"{summary['changed_symbols']}",
            f"- Impact targets: "
            f"{summary['impact_targets']}",
            "",
            "## Targeted Tests",
            "",
            f"- Selected tests: "
            f"{summary['selected_tests']}",
            f"- Passed: "
            f"{summary['tests_passed']}",
            f"- Failed: "
            f"{summary['tests_failed']}",
            f"- Skipped: "
            f"{summary['tests_skipped']}",
            f"- Errors: "
            f"{summary['test_errors']}",
            f"- Total: "
            f"{summary['tests_total']}",
            f"- Pass rate: "
            f"{summary['test_pass_rate']}%",
            "",
            "### Selected Test Targets",
            "",
        ]

        if report["selected_tests"]:
            lines.extend(
                f"- `{target}`"
                for target in report[
                    "selected_tests"
                ]
            )
        else:
            lines.append(
                "- No related tests identified."
            )

        lines.extend(
            [
                "",
                "## Test Output",
                "",
                "```text",
                test_results.get(
                    "output",
                    "",
                ),
                "```",
                "",
                "## Changed Files",
                "",
            ]
        )

        for changed_file in report[
            "changed_files"
        ]:
            lines.append(
                f"- `{changed_file['path']}` "
                f"({changed_file['change_type']}, "
                f"+{changed_file['additions']} "
                f"-{changed_file['deletions']})"
            )

        lines.extend(
            [
                "",
                "## Changed Symbols",
                "",
            ]
        )

        for symbol in report[
            "changed_symbols"
        ]:
            lines.append(
                f"- `{symbol['file_path']}::"
                f"{symbol['name']}` "
                f"({symbol['change_type']})"
            )

        lines.extend(
            [
                "",
                "## Impact Analysis",
                "",
            ]
        )

        for impact in report[
            "impacts"
        ]:
            target = impact[
                "target"
            ]

            lines.append(
                f"### `{target['file_path']}::"
                f"{target['function_name']}`"
            )

            if impact[
                "function_calls"
            ]:
                lines.append(
                    "- Callers:"
                )

                for call in impact[
                    "function_calls"
                ]:
                    lines.append(
                        f"  - "
                        f"`{call['file_path']}::"
                        f"{call['function_name']}`"
                    )

            if impact[
                "module_imports"
            ]:
                lines.append(
                    "- Importing files:"
                )

                for import_item in impact[
                    "module_imports"
                ]:
                    lines.append(
                        f"  - "
                        f"`{import_item['file_path']}`"
                    )

            if impact[
                "related_tests"
            ]:
                lines.append(
                    "- Related tests:"
                )

                for test in impact[
                    "related_tests"
                ]:
                    lines.append(
                        f"  - "
                        f"`{test['file_path']}::"
                        f"{test['test_name']}`"
                    )

            lines.append("")

        lines.extend(
            [
                "## Grounding Policy",
                "",
                "This report uses repository Git history, "
                "AST-based change/impact analysis, and "
                "actual pytest execution results. "
                "No LLM-generated claim is used as evidence "
                "for changed files, impacted symbols, "
                "selected tests, or test success.",
                "",
            ]
        )

        output_path = (
            self.output_directory / filename
        )

        output_path.write_text(
            "\n".join(lines),
            encoding="utf-8",
        )

        return output_path


if __name__ == "__main__":
    doctor = AutomatedDoctor(
        repository_path="data/repositories/demo-task-api"
    )

    result = doctor.analyze(
        from_commit="98efbb9",
        to_commit="34cac1f",
    )

    json_path = doctor.write_json(
        result
    )

    markdown_path = doctor.write_markdown(
        result
    )

    print(
        "Automated Doctor completed."
    )
    print(
        f"JSON report: {json_path}"
    )
    print(
        f"Markdown report: {markdown_path}"
    )
    print(
        f"Regression detected: "
        f"{result['summary']['regression_detected']}"
    )