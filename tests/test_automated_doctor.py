from pathlib import Path
from unittest.mock import MagicMock, patch

from app.reports.automated_doctor import AutomatedDoctor


def test_extract_test_targets_returns_unique_pytest_node_ids():
    impacts = [
        {
            "related_tests": [
                {
                    "file_path": "tests/test_tasks.py",
                    "test_name": "test_complete_task",
                },
                {
                    "file_path": "tests/test_tasks.py",
                    "test_name": "test_complete_task_preserves_priority",
                },
            ]
        },
        {
            "related_tests": [
                {
                    "file_path": "tests/test_tasks.py",
                    "test_name": "test_complete_task",
                }
            ]
        },
    ]

    result = AutomatedDoctor._extract_test_targets(impacts)

    assert result == [
        "tests/test_tasks.py::test_complete_task",
        "tests/test_tasks.py::test_complete_task_preserves_priority",
    ]


def test_build_summary_detects_regression():
    change_analysis = {
        "changed_files": [
            {"path": "app/tasks.py"},
            {"path": "tests/test_tasks.py"},
        ],
        "changed_symbols": [
            {"name": "complete_task"},
        ],
        "impacts": [
            {"target": {"file_path": "app/tasks.py"}}
        ],
    }

    test_results = {
        "passed": 1,
        "failed": 1,
        "skipped": 0,
        "errors": 0,
        "total": 2,
        "pass_rate": 50.0,
    }

    selected_tests = [
        "tests/test_tasks.py::test_complete_task",
        "tests/test_tasks.py::test_complete_task_preserves_priority",
    ]

    summary = AutomatedDoctor._build_summary(
        change_analysis=change_analysis,
        test_results=test_results,
        selected_tests=selected_tests,
    )

    assert summary["changed_files"] == 2
    assert summary["changed_symbols"] == 1
    assert summary["impact_targets"] == 1
    assert summary["selected_tests"] == 2
    assert summary["tests_passed"] == 1
    assert summary["tests_failed"] == 1
    assert summary["tests_total"] == 2
    assert summary["test_pass_rate"] == 50.0
    assert summary["regression_detected"] is True


def test_build_summary_reports_no_regression_when_all_tests_pass():
    change_analysis = {
        "changed_files": [
            {"path": "app/tasks.py"},
        ],
        "changed_symbols": [
            {"name": "complete_task"},
        ],
        "impacts": [],
    }

    test_results = {
        "passed": 2,
        "failed": 0,
        "skipped": 0,
        "errors": 0,
        "total": 2,
        "pass_rate": 100.0,
    }

    summary = AutomatedDoctor._build_summary(
        change_analysis=change_analysis,
        test_results=test_results,
        selected_tests=[
            "tests/test_tasks.py::test_complete_task",
            "tests/test_tasks.py::test_complete_task_preserves_priority",
        ],
    )

    assert summary["tests_passed"] == 2
    assert summary["tests_failed"] == 0
    assert summary["test_pass_rate"] == 100.0
    assert summary["regression_detected"] is False


def test_analyze_runs_change_analysis_and_selected_tests():
    fake_change_analysis = {
        "from_commit": "commit-a",
        "to_commit": "commit-b",
        "changed_files": [
            {
                "path": "app/tasks.py",
                "change_type": "M",
                "additions": 3,
                "deletions": 2,
            }
        ],
        "changed_symbols": [
            {
                "file_path": "app/tasks.py",
                "name": "complete_task",
                "change_type": "modified",
            }
        ],
        "impacts": [
            {
                "target": {
                    "file_path": "app/tasks.py",
                    "function_name": "complete_task",
                },
                "function_calls": [],
                "module_imports": [],
                "related_tests": [
                    {
                        "file_path": "tests/test_tasks.py",
                        "test_name": "test_complete_task",
                    }
                ],
            }
        ],
    }

    fake_test_results = {
        "passed": 1,
        "failed": 0,
        "skipped": 0,
        "errors": 0,
        "total": 1,
        "pass_rate": 100.0,
        "exit_code": 0,
        "output": "1 passed",
        "selected_tests": [
            "tests/test_tasks.py::test_complete_task"
        ],
    }

    with patch(
        "app.reports.automated_doctor.ChangeAnalysisService"
    ) as mock_change_service:
        with patch(
            "app.reports.automated_doctor.TestRunner"
        ) as mock_test_runner:
            mock_change_service.return_value.analyze.return_value = (
                fake_change_analysis
            )
            mock_test_runner.return_value.run_selected.return_value = (
                fake_test_results
            )

            doctor = AutomatedDoctor(
                repository_path="."
            )

            report = doctor.analyze(
                from_commit="commit-a",
                to_commit="commit-b",
            )

    mock_change_service.return_value.analyze.assert_called_once_with(
        from_commit="commit-a",
        to_commit="commit-b",
    )

    mock_test_runner.return_value.run_selected.assert_called_once_with(
        repository_path=str(Path(".").resolve()),
        test_targets=[
            "tests/test_tasks.py::test_complete_task"
        ],
    )

    assert report["from_commit"] == "commit-a"
    assert report["to_commit"] == "commit-b"
    assert report["selected_tests"] == [
        "tests/test_tasks.py::test_complete_task"
    ]
    assert report["summary"]["tests_passed"] == 1
    assert report["summary"]["regression_detected"] is False


def test_write_json_and_markdown_create_reports(tmp_path):
    doctor = AutomatedDoctor(
        repository_path=".",
        output_directory=str(tmp_path),
    )

    report = {
        "generated_at": "2026-10-06T00:00:00+00:00",
        "repository": "demo",
        "from_commit": "commit-a",
        "to_commit": "commit-b",
        "changed_files": [],
        "changed_symbols": [],
        "impacts": [],
        "selected_tests": [],
        "test_results": {
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "errors": 0,
            "total": 0,
            "pass_rate": 0.0,
            "output": "",
        },
        "summary": {
            "changed_files": 0,
            "changed_symbols": 0,
            "impact_targets": 0,
            "selected_tests": 0,
            "tests_passed": 0,
            "tests_failed": 0,
            "tests_skipped": 0,
            "test_errors": 0,
            "tests_total": 0,
            "test_pass_rate": 0.0,
            "regression_detected": False,
        },
    }

    json_path = doctor.write_json(report)
    markdown_path = doctor.write_markdown(report)

    assert json_path.exists()
    assert markdown_path.exists()

    assert json_path.read_text(encoding="utf-8").strip()
    assert markdown_path.read_text(encoding="utf-8").strip()

    assert "Automated Doctor Report" in markdown_path.read_text(
        encoding="utf-8"
    )
    assert '"regression_detected": false' in json_path.read_text(
        encoding="utf-8"
    )