from typing import Any, Protocol


class SearchAdapter(Protocol):
    def index_story(self, story: dict[str, Any]) -> None: ...

    def search_stories(self, query: dict[str, Any]) -> dict[str, Any]: ...


class OpenSearchAdapter:
    def __init__(self, base_url: str | None):
        self.base_url = base_url
        # real client wiring deferred to Sprint 2

    def index_story(self, story: dict[str, Any]) -> None:
        # TODO: implement OpenSearch client call
        return None

    def search_stories(self, query: dict[str, Any]) -> dict[str, Any]:
        # TODO: implement OpenSearch query
        return {"hits": []}
