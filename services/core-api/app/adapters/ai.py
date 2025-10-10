from typing import Protocol


class AIAdapter(Protocol):
    def generate(self, prompt: str, model: str | None = None) -> str: ...


class LiteLLMAdapter:
    def __init__(self, base_url: str | None):
        self.base_url = base_url

    def generate(self, prompt: str, model: str | None = None) -> str:
        # TODO: call LiteLLM endpoint
        return ""
