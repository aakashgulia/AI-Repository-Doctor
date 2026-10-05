from __future__ import annotations

import json
import sys
from pathlib import Path


# Make the project root available when this file is executed directly.
PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from app.analysis.change_service import ChangeAnalysisService
from app.core.llm_service import LLMService


class ChangeInterpreter:
    """
    Interpret deterministic repository change evidence using an LLM.

    Important:
        Git and AST analysis are the source of truth.
        The LLM is only responsible for explaining the evidence.
    """

    def __init__(self):
        self.llm_service = LLMService()

    @staticmethod
    def _build_evidence(change_analysis: dict) -> str:
        """Convert structured change analysis into LLM evidence."""

        return json.dumps(
            change_analysis,
            indent=2,
            ensure_ascii=False,
        )

    @staticmethod
    def _normalize_result(result: dict) -> dict:
        """Normalize the LLM response into the expected structure."""

        return {
            "summary": str(
                result.get("summary", "")
            ).strip(),

            "why_it_matters": str(
                result.get("why_it_matters", "")
            ).strip(),

            "regression_risk": str(
                result.get("regression_risk", "")
            ).strip(),

            "affected_areas": (
                result.get("affected_areas", [])
                if isinstance(
                    result.get("affected_areas", []),
                    list,
                )
                else []
            ),

            "recommended_tests": (
                result.get("recommended_tests", [])
                if isinstance(
                    result.get("recommended_tests", []),
                    list,
                )
                else []
            ),

            "confidence": result.get(
                "confidence",
                0,
            ),
        }

    def interpret(
        self,
        change_analysis: dict,
    ) -> dict:
        """
        Interpret a deterministic change analysis.

        The supplied change_analysis must contain repository-derived
        evidence such as commits, changed files, diff, symbols,
        callers, and related tests.
        """

        if not isinstance(change_analysis, dict):
            raise ValueError(
                "Change analysis must be a dictionary."
            )

        required_fields = {
            "from_commit",
            "to_commit",
            "changed_files",
            "diff",
            "changed_symbols",
            "impacts",
        }

        missing_fields = sorted(
            required_fields
            - set(change_analysis.keys())
        )

        if missing_fields:
            raise ValueError(
                "Change analysis is missing required fields: "
                + ", ".join(missing_fields)
            )

        evidence = self._build_evidence(
            change_analysis
        )

        system_prompt = """
You are the AI interpretation layer of an
AI-Powered Repository Doctor.

Your job is to explain ACTUAL repository change evidence.

CRITICAL RULES:

1. The supplied evidence is authoritative.
2. Do not invent files, functions, classes, callers,
   tests, dependencies, or behavior that are not supported
   by the evidence.
3. Do not claim that a function is affected merely because
   it sounds logically related.
4. Clearly distinguish observed facts from reasonable
   interpretation.
5. Do not say that code was fixed or changed beyond what
   the supplied Git diff proves.
6. If evidence is insufficient, explicitly say so.
7. Regression risk must be based on the actual diff,
   changed symbols, callers, and tests.
8. Recommended tests should be specific to the observed
   change.
9. Return ONLY valid JSON.
10. Do not use Markdown inside the JSON values.

Return exactly this structure:

{
  "summary": "What changed.",
  "why_it_matters": "Why the change matters.",
  "regression_risk": "Low, Medium, or High, with a concise explanation.",
  "affected_areas": [
    "Repository-grounded affected area"
  ],
  "recommended_tests": [
    "Specific test or check"
  ],
  "confidence": 0
}

The confidence value must be an integer from 0 to 100.
"""

        user_prompt = f"""
Analyze the following repository change evidence.

The comparison direction is:

FROM COMMIT
to
TO COMMIT

Do not reverse the direction.

Repository evidence:

{evidence}

Explain what changed, why it matters, regression risk,
affected areas, and recommended tests.

Use only the supplied evidence.
"""

        raw_response = self.llm_service.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            json_mode=True,
        )

        if isinstance(raw_response, dict):
            parsed_result = raw_response
        else:
            response_text = str(raw_response).strip()

            try:
                parsed_result = json.loads(
                    response_text
                )
            except json.JSONDecodeError as error:
                raise ValueError(
                    "LLM returned invalid JSON."
                ) from error

        if not isinstance(parsed_result, dict):
            raise ValueError(
                "LLM response must be a JSON object."
            )

        normalized = self._normalize_result(
            parsed_result
        )

        if not normalized["summary"]:
            raise ValueError(
                "LLM response did not contain a summary."
            )

        return {
            "status": "success",
            "interpretation": normalized,
        }


if __name__ == "__main__":
    repository = (
        "data/repositories/demo-task-api"
    )

    change_service = ChangeAnalysisService(
        repository
    )

    change_analysis = change_service.analyze(
        from_commit="98efbb9",
        to_commit="34cac1f",
    )

    interpreter = ChangeInterpreter()

    result = interpreter.interpret(
        change_analysis
    )

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )