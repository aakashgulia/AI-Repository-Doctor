import json

from app.core.llm_service import LLMService
from app.rag.context_builder import ContextBuilder


class ChatEngine:
    """Repository-grounded conversational assistant."""

    def __init__(self, repository_path: str):
        self.repository_path = repository_path
        self.llm = LLMService()
        self.context_builder = ContextBuilder(
            repository_path=repository_path
        )

    def ask(self, question: str) -> dict:
        """Answer a developer question using repository evidence."""

        if not question or not question.strip():
            raise ValueError("Question cannot be empty.")

        question = question.strip()

        context = self.context_builder.build_context(
            query=question,
            top_k=5,
        )

        system_prompt = """
You are Repository Doctor, an AI software engineering assistant.

Your job is to answer developer questions about the selected repository.

GROUNDING RULES:
1. Use ONLY the repository evidence provided in the prompt.
2. Do not invent files, functions, classes, dependencies, behavior, or errors.
3. If the evidence is insufficient, clearly say that the repository evidence is insufficient.
4. Do not claim that you changed or fixed any code.
5. Explain technical concepts clearly and concisely.
6. When possible, mention the relevant file names from the evidence.
7. Treat the developer's question as a question about the repository unless it is clearly general knowledge.

Return VALID JSON ONLY using exactly this structure:

{
  "answer": "Your grounded answer",
  "confidence": 0,
  "evidence": [
    "Relevant repository evidence"
  ]
}

Confidence must be an integer from 0 to 100.
"""

        prompt = f"""
DEVELOPER QUESTION
==================
{question}

{context}

Answer the developer's question using the repository evidence above.
"""

        raw_response = self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            json_mode=True,
        )

        try:
            result = json.loads(raw_response)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"Doctor Chat returned invalid JSON: {error}"
            )

        answer = result.get("answer")

        if not isinstance(answer, str) or not answer.strip():
            raise ValueError(
                "Doctor Chat returned an empty answer."
            )

        confidence = result.get("confidence", 0)

        try:
            confidence = int(confidence)
        except (TypeError, ValueError):
            confidence = 0

        confidence = max(0, min(100, confidence))

        evidence = result.get("evidence", [])

        if not isinstance(evidence, list):
            evidence = []

        evidence = [
            str(item)
            for item in evidence
            if str(item).strip()
        ]

        return {
            "status": "success",
            "question": question,
            "answer": answer.strip(),
            "confidence": confidence,
            "evidence": evidence,
        }


if __name__ == "__main__":
    engine = ChatEngine(
        "data/repositories/demo-task-api"
    )

    result = engine.ask(
        "Why does completing a task remove its priority?"
    )

    print(json.dumps(result, indent=2))