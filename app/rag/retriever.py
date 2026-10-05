from app.rag.vector_store import CodeVectorStore


class CodeRetriever:
    """Retrieve relevant code from a specific repository."""

    def __init__(self, repository_path: str):
        self.vector_store = CodeVectorStore(
            repository_path=repository_path
        )

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
    ) -> list[dict]:
        """Retrieve relevant repository code."""

        if not query.strip():
            return []

        return self.vector_store.search(
            query=query,
            top_k=top_k,
        )


if __name__ == "__main__":
    repository_path = (
        "data/repositories/demo-task-api"
    )

    retriever = CodeRetriever(
        repository_path=repository_path
    )

    results = retriever.retrieve(
        "Why does completing a task remove its priority?",
        top_k=3,
    )

    print(f"Retrieved: {len(results)} results")

    for index, result in enumerate(
        results,
        start=1,
    ):
        print(
            f"\n--- Result {index} ---"
        )
        print(
            f"File: {result['file_path']}"
        )
        print(
            f"Chunk: {result['chunk_id']}"
        )
        print(
            f"Distance: {result['distance']}"
        )