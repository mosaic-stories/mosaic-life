from typing import Protocol


class EventPublisher(Protocol):
    def publish(
        self, event_type: str, payload: dict, attributes: dict | None = None
    ) -> None: ...


class SnsPublisher:
    def __init__(self, topic_arn: str | None):
        self.topic_arn = topic_arn

    def publish(
        self, event_type: str, payload: dict, attributes: dict | None = None
    ) -> None:
        # TODO: implement SNS publish
        return None
