from __future__ import annotations

import sys
from pathlib import Path


# Make the project root available when this file is executed directly.
PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from app.analysis.change_analyzer import ChangeAnalyzer
from app.analysis.git_analyzer import GitAnalyzer
from app.analysis.impact_analyzer import ImpactAnalyzer


class ChangeAnalysisService:
    """
    Combine Git, symbol, and impact analysis into one result.

    Pipeline:

        Git history
            ↓
        Git diff
            ↓
        Changed files
            ↓
        Changed symbols
            ↓
        Impact analysis
    """

    def __init__(self, repository_path: str):
        self.repository_path = repository_path

        self.git_analyzer = GitAnalyzer(
            repository_path
        )

        self.change_analyzer = ChangeAnalyzer(
            repository_path
        )

        self.impact_analyzer = ImpactAnalyzer(
            repository_path
        )

    def analyze(
        self,
        from_commit: str,
        to_commit: str,
    ) -> dict:
        """Analyze a repository change from one commit to another."""

        if not from_commit or not from_commit.strip():
            raise ValueError(
                "From commit cannot be empty."
            )

        if not to_commit or not to_commit.strip():
            raise ValueError(
                "To commit cannot be empty."
            )

        if from_commit.strip() == to_commit.strip():
            raise ValueError(
                "From and to commits must be different."
            )

        # ---------------------------------------------------------
        # 1. Git + changed-symbol analysis
        # ---------------------------------------------------------

        change_analysis = (
            self.change_analyzer.analyze_dict(
                from_commit=from_commit,
                to_commit=to_commit,
            )
        )

        # ---------------------------------------------------------
        # 2. Get the actual Git diff
        #
        # ChangeAnalyzer focuses on symbol-level analysis.
        # GitAnalyzer is the authoritative source for the
        # complete commit diff.
        # ---------------------------------------------------------

        diff = self.git_analyzer.get_diff(
            from_commit=from_commit,
            to_commit=to_commit,
        )

        # ---------------------------------------------------------
        # 3. Dependency / impact analysis
        # ---------------------------------------------------------

        impact_analysis = (
            self.impact_analyzer.analyze_changed_symbols(
                change_analysis["changed_symbols"]
            )
        )

        # ---------------------------------------------------------
        # 4. Combine everything
        # ---------------------------------------------------------

        return {
            "from_commit": change_analysis["from_commit"],
            "to_commit": change_analysis["to_commit"],
            "changed_files": change_analysis["changed_files"],
            "diff": diff,
            "changed_symbols": change_analysis["changed_symbols"],
            "impacts": impact_analysis["symbol_impacts"],
        }


if __name__ == "__main__":
    service = ChangeAnalysisService(
        "data/repositories/demo-task-api"
    )

    result = service.analyze(
        from_commit="98efbb9",
        to_commit="34cac1f",
    )

    print("From commit:")
    print(result["from_commit"])

    print("\nTo commit:")
    print(result["to_commit"])

    print("\nChanged files:")

    for changed_file in result["changed_files"]:
        print(
            f"  {changed_file['change_type']} "
            f"{changed_file['path']} "
            f"(+{changed_file['additions']} "
            f"-{changed_file['deletions']})"
        )

    print(
        "\nChanged symbols:",
        len(result["changed_symbols"]),
    )

    for symbol in result["changed_symbols"]:
        print(
            f"  {symbol['change_type']} "
            f"{symbol['file_path']}::"
            f"{symbol['name']}"
        )

    print(
        "\nImpact analyses:",
        len(result["impacts"]),
    )

    for impact in result["impacts"]:
        target = impact["target"]

        print(
            f"  {target['file_path']}::"
            f"{target['function_name']} "
            f"| callers={len(impact['function_calls'])} "
            f"| tests={len(impact['related_tests'])}"
        )

    print("\nDiff:")
    print(result["diff"])