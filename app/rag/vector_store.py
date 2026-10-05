from pathlib import Path
import hashlib

import chromadb
from chromadb.utils import embedding_functions


VECTORSTORE_PATH = Path("data/vectorstore")
COLLECTION_PREFIX = "repository_"


class CodeVectorStore:
    def __init__(self, repository_path: str):
        VECTORSTORE_PATH.mkdir(
            parents=True,
            exist_ok=True,
        )

        self.repository_path = str(
            Path(repository_path).resolve()
        )

        self.client = chromadb.PersistentClient(
            path=str(VECTORSTORE_PATH)
        )

        self.embedding_function = (
            embedding_functions.DefaultEmbeddingFunction()
        )

        repository_hash = hashlib.sha256(
            self.repository_path.encode("utf-8")
        ).hexdigest()[:16]

        collection_name = (
            f"{COLLECTION_PREFIX}{repository_hash}"
        )

        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_function,
        )

    def add_chunks(self, chunks: list[dict]) -> int:
        """
        Add code chunks to this repository's ChromaDB collection.
        """

        if not chunks:
            return 0

        ids = []
        documents = []
        metadatas = []

        for chunk in chunks:
            chunk_id = (
                f"{chunk['file_path']}"
                f"::chunk-{chunk['chunk_id']}"
            )

            ids.append(chunk_id)
            documents.append(chunk["content"])

            metadatas.append(
                {
                    "file_path": chunk["file_path"],
                    "chunk_id": str(chunk["chunk_id"]),
                    "start_char": str(chunk["start_char"]),
                    "end_char": str(chunk["end_char"]),
                    "repository_path": self.repository_path,
                }
            )

        self.collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )

        return len(chunks)

    def clear(self) -> None:
        """
        Remove all existing chunks from this repository's
        vector collection.

        This ensures a fresh indexing run cannot leave
        stale chunks from an older repository version.
        """

        existing = self.collection.get()

        ids = existing.get("ids", [])

        if ids:
            self.collection.delete(ids=ids)

    def search(
        self,
        query: str,
        top_k: int = 5,
    ) -> list[dict]:
        """
        Search only within this repository's indexed code.
        """

        if not query.strip():
            return []

        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
        )

        matches = []

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for document, metadata, distance in zip(
            documents,
            metadatas,
            distances,
        ):
            matches.append(
                {
                    "content": document,
                    "file_path": metadata["file_path"],
                    "chunk_id": metadata["chunk_id"],
                    "distance": distance,
                }
            )

        return matches

    def count(self) -> int:
        """
        Return the number of indexed chunks
        for this repository.
        """

        return self.collection.count()