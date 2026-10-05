from app.rag.retriever import CodeRetriever


class ContextBuilder:
    """Build grounded LLM context from a specific repository."""

    def __init__(self, repository_path: str):
        self.retriever = CodeRetriever(
            repository_path=repository_path
        )

    def build_context(
        self,
        query: str,
        top_k: int = 5,
    ) -> str:
        """Build context using only this repository's evidence."""

        results = self.retriever.retrieve(
            query=query,
            top_k=top_k,
        )

        if not results:
            return "No relevant repository evidence was found."

        context_parts = [
            "RELEVANT REPOSITORY EVIDENCE",
            "================================",
        ]

        for index, result in enumerate(
            results,
            start=1,
        ):
            context_parts.append(
                f"""
Evidence {index}
File: {result['file_path']}
Chunk: {result['chunk_id']}
Retrieval distance: {result['distance']}

Code:
{result['content']}
"""
            )

        return "\n".join(context_parts)


if __name__ == "__main__":
    repository_path = (
        "data/repositories/demo-task-api"
    )

    builder = ContextBuilder(
        repository_path=repository_path
    )

    context = builder.build_context(
        "Why does completing a task remove its priority?",
        top_k=3,
    )

    print(context)