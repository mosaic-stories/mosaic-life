"""Service for extracting entities from story content via LLM."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from opentelemetry import trace

from ..observability.metrics import ENTITY_EXTRACTION_ENTITIES

if TYPE_CHECKING:
    from ..adapters.ai import LLMProvider

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.entity_extraction")

_EXTRACTION_PROMPT = """\
Extract structured entities from the following story content.
Return ONLY valid JSON with no markdown formatting.

For each entity, provide a confidence score (0.0-1.0) indicating how certain \
you are that this is a real, distinct entity worth tracking.

Output format:
{
  "people": [{"name": "...", "context": "relationship or role", "confidence": 0.0-1.0}],
  "places": [{"name": "...", "type": "city|residence|workplace|school|other", "location": "...", "confidence": 0.0-1.0}],
  "events": [{"name": "...", "type": "family_gathering|career|education|travel|other", "date": "...", "confidence": 0.0-1.0}],
  "objects": [{"name": "...", "type": "heirloom|photo|document|other", "confidence": 0.0-1.0}],
  "time_references": [{"period": "...", "context": "..."}]
}

Rules:
- Only extract entities that are specifically mentioned, not implied.
- For people, capture the relationship context (e.g., "mother's brother", "college friend").
- For places, include location details when available.
- Set confidence below 0.5 for vague or ambiguous mentions.
- Do not extract the story's main subject (they are already tracked).
"""


@dataclass
class ExtractedEntity:
    """A single extracted entity."""

    name: str
    context: str = ""
    confidence: float = 0.0
    type: str = ""
    location: str = ""
    date: str = ""
    period: str = ""


@dataclass
class ExtractedEntities:
    """All entities extracted from a story."""

    people: list[ExtractedEntity] = field(default_factory=list)
    places: list[ExtractedEntity] = field(default_factory=list)
    events: list[ExtractedEntity] = field(default_factory=list)
    objects: list[ExtractedEntity] = field(default_factory=list)
    time_references: list[ExtractedEntity] = field(default_factory=list)

    def filter_by_confidence(self, threshold: float = 0.7) -> ExtractedEntities:
        """Return a copy with only entities above the confidence threshold."""
        return ExtractedEntities(
            people=[e for e in self.people if e.confidence >= threshold],
            places=[e for e in self.places if e.confidence >= threshold],
            events=[e for e in self.events if e.confidence >= threshold],
            objects=[e for e in self.objects if e.confidence >= threshold],
            time_references=self.time_references,  # No confidence on time refs
        )


def _parse_entity_list(
    raw_list: list[dict[str, Any]], entity_type: str
) -> list[ExtractedEntity]:
    """Parse a list of raw entity dicts into ExtractedEntity objects."""
    entities: list[ExtractedEntity] = []
    for item in raw_list:
        entities.append(
            ExtractedEntity(
                name=item.get("name", ""),
                context=item.get("context", ""),
                confidence=float(item.get("confidence", 0.0)),
                type=item.get("type", ""),
                location=item.get("location", ""),
                date=item.get("date", ""),
                period=item.get("period", ""),
            )
        )
    return entities


class EntityExtractionService:
    """Extracts structured entities from story content using an LLM."""

    def __init__(self, llm_provider: LLMProvider, model_id: str) -> None:
        self._llm_provider = llm_provider
        self._model_id = model_id

    async def extract_entities(self, story_content: str) -> ExtractedEntities:
        """Extract entities from story content.

        Returns empty ExtractedEntities on failure (best-effort).
        """
        with tracer.start_as_current_span("entity_extraction.extract") as span:
            span.set_attribute("content_length", len(story_content))

            try:
                chunks: list[str] = []
                async for chunk in self._llm_provider.stream_generate(
                    messages=[{"role": "user", "content": story_content}],
                    system_prompt=_EXTRACTION_PROMPT,
                    model_id=self._model_id,
                    max_tokens=2048,
                ):
                    chunks.append(chunk)

                raw_text = "".join(chunks).strip()
                # Strip markdown code fences if present
                if raw_text.startswith("```"):
                    lines = raw_text.split("\n")
                    raw_text = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_text

                data: dict[str, Any] = json.loads(raw_text)

                result = ExtractedEntities(
                    people=_parse_entity_list(data.get("people", []), "person"),
                    places=_parse_entity_list(data.get("places", []), "place"),
                    events=_parse_entity_list(data.get("events", []), "event"),
                    objects=_parse_entity_list(data.get("objects", []), "object"),
                    time_references=_parse_entity_list(
                        data.get("time_references", []), "time"
                    ),
                )

                span.set_attribute(
                    "entity_count",
                    len(result.people)
                    + len(result.places)
                    + len(result.events)
                    + len(result.objects),
                )

                ENTITY_EXTRACTION_ENTITIES.labels(type="person").inc(len(result.people))
                ENTITY_EXTRACTION_ENTITIES.labels(type="place").inc(len(result.places))
                ENTITY_EXTRACTION_ENTITIES.labels(type="event").inc(len(result.events))
                ENTITY_EXTRACTION_ENTITIES.labels(type="object").inc(
                    len(result.objects)
                )

                logger.info(
                    "entity_extraction.extracted",
                    extra={
                        "people": len(result.people),
                        "places": len(result.places),
                        "events": len(result.events),
                        "objects": len(result.objects),
                    },
                )
                return result

            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                logger.warning(
                    "entity_extraction.parse_failed",
                    extra={"error": str(exc)},
                )
                return ExtractedEntities()
            except Exception as exc:
                logger.warning(
                    "entity_extraction.failed",
                    extra={"error": str(exc)},
                )
                return ExtractedEntities()
