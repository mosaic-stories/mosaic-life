from typing import Protocol


class SearchAdapter(Protocol):
    def index_story(self, story: dict) -> None: ...

    def search_stories(self, query: dict) -> dict: ...


class OpenSearchAdapter:
    def __init__(self, base_url: str | None):
        self.base_url = base_url
        # real client wiring deferred to Sprint 2

    def index_story(self, story: dict) -> None:
        # TODO: implement OpenSearch client call
        return None

    def search_stories(self, query: dict) -> dict:
        # TODO: implement OpenSearch query
        return {"hits": []}

