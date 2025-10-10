from typing import Any, Protocol


class EventPublisher(Protocol):
    def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
        attributes: dict[str, str] | None = None,
    ) -> None: ...


class SnsPublisher:
    def __init__(self, topic_arn: str | None):
        self.topic_arn = topic_arn

    def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
        attributes: dict[str, str] | None = None,
    ) -> None:
        # TODO: implement SNS publish
        return None
