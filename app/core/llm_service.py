import os

from dotenv import load_dotenv
from groq import Groq


load_dotenv()


class LLMService:
    """Service for communicating with the Groq-hosted language model."""

    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise ValueError(
                "GROQ_API_KEY is not configured. "
                "Make sure it exists in the project .env file."
            )

        self.client = Groq(api_key=api_key)
        self.model = "openai/gpt-oss-120b"

    def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        json_mode: bool = False,
    ) -> str:
        """Generate a response from the configured LLM."""

        messages = []

        if system_prompt:
            messages.append(
                {
                    "role": "system",
                    "content": system_prompt,
                }
            )

        messages.append(
            {
                "role": "user",
                "content": prompt,
            }
        )

        request_kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }

        if json_mode:
            request_kwargs["response_format"] = {
                "type": "json_object",
            }

        response = self.client.chat.completions.create(
            **request_kwargs,
        )

        return response.choices[0].message.content or ""


if __name__ == "__main__":
    llm = LLMService()

    response = llm.generate(
        "Return a JSON object containing one key called 'answer' "
        "with a one-sentence explanation of what a FastAPI endpoint is.",
        system_prompt=(
            "You are a precise software engineering assistant. "
            "Return valid JSON only."
        ),
        json_mode=True,
    )

    print(response)