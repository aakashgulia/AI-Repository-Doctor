import json
import re

from app.core.llm_service import LLMService
from app.rag.context_builder import ContextBuilder


class DiagnosisEngine:
    """Diagnose developer-reported problems using repository evidence and an LLM."""

    # Inputs that are clearly not technical problem descriptions.
    _INVALID_INPUTS = {
        "hi",
        "hello",
        "hey",
        "hii",
        "hiii",
        "test",
        "testing",
        "ok",
        "okay",
        "thanks",
        "thank you",
        "good morning",
        "good afternoon",
        "good evening",
        "asdf",
        "qwerty",
        "how are you",
        "how are you doing",
        "how r u",
        "how r u doing",
        "how are u",
        "how r you",
        "whats up",
        "what's up",
        "what is up",
        "who are you",
        "what are you",
        "what can you do",
        "nice to meet you",
    }

    # Common conversational patterns that should never be sent to the
    # diagnosis engine.
    _CONVERSATIONAL_PATTERNS = (
        r"^how\s+(are|r)\s+(you|u)(\s+doing)?$",
        r"^how\s+(are|r)\s+(you|u)\s+doing$",
        r"^what('?s| is)\s+up$",
        r"^who\s+are\s+(you|u)$",
        r"^what\s+are\s+(you|u)$",
        r"^what\s+can\s+(you|u)\s+do$",
        r"^how\s+is\s+(your|ur)\s+day$",
        r"^how('?s| is)\s+(it|everything)\s+going$",
        r"^good\s+(morning|afternoon|evening)$",
        r"^(hi|hello|hey)[\s!,.]*$",
    )

    # Technical terms that strongly indicate a developer problem.
    _TECHNICAL_TERMS = {
        "bug",
        "error",
        "exception",
        "traceback",
        "failure",
        "failing",
        "fails",
        "failed",
        "crash",
        "crashes",
        "broken",
        "breaks",
        "issue",
        "problem",
        "wrong",
        "incorrect",
        "unexpected",
        "api",
        "code",
        "function",
        "method",
        "class",
        "variable",
        "database",
        "db",
        "sql",
        "query",
        "request",
        "response",
        "endpoint",
        "server",
        "frontend",
        "backend",
        "login",
        "logout",
        "authentication",
        "authorization",
        "permission",
        "test",
        "tests",
        "pytest",
        "dependency",
        "import",
        "module",
        "package",
        "build",
        "compile",
        "compilation",
        "runtime",
        "keyerror",
        "typeerror",
        "valueerror",
        "indexerror",
        "attributeerror",
        "null",
        "none",
        "undefined",
        "timeout",
        "status",
        "http",
        "500",
        "404",
        "400",
        "401",
        "403",
    }

    def __init__(self, repository_path: str):
        self.repository_path = repository_path
        self.context_builder = ContextBuilder(repository_path)
        self.llm = LLMService()

    def diagnose(self, problem: str, top_k: int = 5) -> dict:
        """Retrieve repository evidence and generate a structured diagnosis."""

        self._validate_problem(problem)

        context = self.context_builder.build_context(
            query=problem,
            top_k=top_k,
        )

        system_prompt = """
You are Repository Doctor, an expert software debugging assistant.

Diagnose the developer-reported problem using ONLY the repository
evidence provided.

Return VALID JSON ONLY.

Use exactly this structure:

{
  "root_cause": "Clear explanation of the most likely root cause.",
  "affected_files": [
    "repository/file/path.py"
  ],
  "evidence": [
    "Specific evidence from the repository supporting the diagnosis."
  ],
  "recommendations": [
    "Practical next step or recommendation."
  ],
  "risk": "LOW"
}

Rules:

- "risk" must be exactly LOW, MEDIUM, or HIGH.
- "affected_files" must contain only files supported by the evidence.
- "evidence" must reference actual repository code or tests.
- Do not invent files, functions, dependencies, or behavior.
- If evidence is insufficient, say so clearly in "root_cause" and "evidence".
- If the retrieved repository evidence does not support the developer's problem,
  explicitly say that the available evidence is insufficient.
- Never force a diagnosis merely because repository code was retrieved.
- Do not claim that you changed or fixed any code.
- Keep recommendations concise.
"""

        prompt = f"""
DEVELOPER PROBLEM
=================
{problem}

{context}

Analyze the problem and return the required JSON object.
"""

        response = self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            json_mode=True,
        )

        try:
            parsed = json.loads(response)
        except json.JSONDecodeError:
            parsed = {
                "root_cause": response,
                "affected_files": [],
                "evidence": [],
                "recommendations": [],
                "risk": "MEDIUM",
            }

        affected_files = parsed.get("affected_files", [])
        recommendations = parsed.get("recommendations", [])
        evidence = parsed.get("evidence", [])

        if not isinstance(affected_files, list):
            affected_files = []

        if not isinstance(recommendations, list):
            recommendations = []

        if not isinstance(evidence, list):
            evidence = []

        risk = parsed.get("risk", "MEDIUM")

        if risk not in {"LOW", "MEDIUM", "HIGH"}:
            risk = "MEDIUM"

        return {
            "status": "success",
            "problem": problem,
            "diagnosis": parsed.get(
                "root_cause",
                "No root cause was identified.",
            ),
            "confidence": self._calculate_confidence(
                affected_files=affected_files,
                evidence=evidence,
            ),
            "affected_files": affected_files,
            "recommendations": recommendations,
            "evidence": evidence,
            "risk": risk,
            "retrieved_context": context,
        }

    @classmethod
    def _validate_problem(cls, problem: str) -> None:
        """
        Reject empty, conversational, and obviously non-technical input.

        Validation happens before RAG retrieval so meaningless input cannot
        accidentally produce a repository-grounded-looking diagnosis.
        """

        if not isinstance(problem, str):
            raise ValueError(
                "Problem description must be a text description of a "
                "technical problem."
            )

        cleaned = problem.strip()

        if not cleaned:
            raise ValueError(
                "Problem description cannot be empty."
            )

        normalized = re.sub(r"\s+", " ", cleaned.lower()).strip()

        # Exact non-technical inputs.
        if normalized in cls._INVALID_INPUTS:
            raise ValueError(
                "Please describe a coding problem, error, unexpected "
                "behavior, or other technical issue."
            )

        # Remove punctuation for more reliable matching.
        normalized_without_punctuation = re.sub(
            r"[^a-z0-9_?']+",
            " ",
            normalized,
        ).strip()

        if normalized_without_punctuation in cls._INVALID_INPUTS:
            raise ValueError(
                "Please describe a coding problem, error, unexpected "
                "behavior, or other technical issue."
            )

        # Conversational phrases such as "how r u doing?".
        for pattern in cls._CONVERSATIONAL_PATTERNS:
            if re.fullmatch(pattern, normalized_without_punctuation):
                raise ValueError(
                    "Please describe a coding problem, error, unexpected "
                    "behavior, or other technical issue."
                )

        words = re.findall(r"[a-z0-9_]+", normalized)

        # Very short inputs without a technical signal are unlikely to
        # contain enough information for a useful diagnosis.
        if len(words) <= 2:
            has_technical_term = any(
                cls._is_technical_term(word)
                for word in words
            )

            if not has_technical_term:
                raise ValueError(
                    "Please describe a coding problem, error, unexpected "
                    "behavior, or other technical issue."
                )

    @classmethod
    def _is_technical_term(cls, word: str) -> bool:
        """Check whether a word contains a recognized technical signal."""

        if word in cls._TECHNICAL_TERMS:
            return True

        technical_patterns = (
            "error",
            "exception",
            "traceback",
            "failure",
            "failed",
            "crash",
            "timeout",
        )

        return any(
            pattern in word
            for pattern in technical_patterns
        )

    @staticmethod
    def _calculate_confidence(
        affected_files: list,
        evidence: list,
    ) -> int:
        """
        Calculate a simple evidence-based confidence score.

        This is intentionally deterministic rather than asking the LLM
        to invent a confidence percentage.
        """

        score = 50

        if affected_files:
            score += 20

        if evidence:
            score += min(len(evidence) * 10, 30)

        return min(score, 100)


if __name__ == "__main__":
    repository_path = "data/repositories/demo-task-api"

    engine = DiagnosisEngine(repository_path)

    result = engine.diagnose(
        "Why does completing a task remove its priority?"
    )

    print(json.dumps(result, indent=2))