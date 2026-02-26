"""Service for analyzing user query intent in AI persona conversations."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from opentelemetry import trace

if TYPE_CHECKING:
    from ..adapters.ai import LLMProvider

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.intent_analyzer")

_EMPTY_ENTITIES: dict[str, list[str]] = {
    "people": [],
    "places": [],
    "time_periods": [],
    "events": [],
    "objects": [],
}

_INTENT_PROMPT_TEMPLATE = """\
Given this user message in a conversation about {legacy_subject_name}'s life, \
classify the intent and extract mentioned entities.

User message: {query}
Recent conversation context: {context}

Respond with JSON only, no markdown formatting:
{{
  "intent": "relational|temporal|spatial|entity_focused|general|cross_legacy",
  "entities": {{
    "people": ["Uncle Jim"],
    "places": ["Chicago"],
    "time_periods": ["1970s"],
    "events": ["retirement"],
    "objects": []
  }},
  "confidence": 0.85
}}\
"""


def _build_fallback_intent() -> QueryIntent:
    """Return the default fallback QueryIntent for any failure case."""
    return QueryIntent(
        intent="general",
        entities={
            "people": [],
            "places": [],
            "time_periods": [],
            "events": [],
            "objects": [],
        },
        confidence=0.0,
    )


@dataclass
class QueryIntent:
    """Classified intent and extracted entities for a user query."""

    intent: str
    """
    One of: "relational" | "temporal" | "spatial" | "entity_focused" |
    "general" | "cross_legacy"
    """

    entities: dict[str, list[str]]
    """
    Extracted entities grouped by type:
    ``{"people": [...], "places": [...], "time_periods": [...],
       "events": [...], "objects": [...]}``
    """

    confidence: float
    """Classifier confidence score in the range 0.0–1.0."""


class IntentAnalyzer:
    """Classifies user queries to determine the appropriate graph traversal strategy.

    Uses an LLM to identify the intent (relational, temporal, spatial, etc.) and
    extract named entities mentioned in the query.  Falls back to a "general"
    intent with zero confidence whenever the LLM call or JSON parsing fails, or
    when the returned confidence score is below 0.5.
    """

    def __init__(self, llm_provider: LLMProvider, model_id: str) -> None:
        self._llm_provider = llm_provider
        self._model_id = model_id

    async def analyze(
        self,
        query: str,
        legacy_subject_name: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> QueryIntent:
        """Classify the intent of *query* within a conversation about a legacy.

        Parameters
        ----------
        query:
            The current user message to classify.
        legacy_subject_name:
            The name of the person whose legacy is being discussed.
        conversation_history:
            Optional recent messages for disambiguation context.  At most the
            last 3 turns are included in the prompt.

        Returns
        -------
        QueryIntent
            The classified intent with extracted entities and a confidence
            score.  Returns ``intent="general"`` with ``confidence=0.0`` on
            any error, or when the LLM confidence is below 0.5.
        """
        with tracer.start_as_current_span("intent_analyzer.analyze") as span:
            span.set_attribute("query_length", len(query))
            span.set_attribute("legacy_subject_name", legacy_subject_name)

            # Build the context string from the most recent 2-3 messages.
            context_messages = conversation_history[-3:] if conversation_history else []
            if context_messages:
                context = "; ".join(
                    f"{m['role']}: {m['content']}" for m in context_messages
                )
            else:
                context = "(none)"

            system_prompt = _INTENT_PROMPT_TEMPLATE.format(
                legacy_subject_name=legacy_subject_name,
                query=query,
                context=context,
            )

            try:
                chunks: list[str] = []
                async for chunk in self._llm_provider.stream_generate(
                    messages=[{"role": "user", "content": query}],
                    system_prompt=system_prompt,
                    model_id=self._model_id,
                    max_tokens=512,
                ):
                    chunks.append(chunk)

                raw_text = "".join(chunks).strip()

                # Strip markdown code fences if present (```json ... ``` or ``` ... ```)
                if raw_text.startswith("```"):
                    lines = raw_text.split("\n")
                    raw_text = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_text

                data: dict[str, Any] = json.loads(raw_text)

                intent_value = str(data.get("intent", "general"))
                confidence = float(data.get("confidence", 0.0))

                raw_entities: dict[str, Any] = data.get("entities", {})
                entities: dict[str, list[str]] = {
                    "people": list(raw_entities.get("people", [])),
                    "places": list(raw_entities.get("places", [])),
                    "time_periods": list(raw_entities.get("time_periods", [])),
                    "events": list(raw_entities.get("events", [])),
                    "objects": list(raw_entities.get("objects", [])),
                }

                # Override intent to "general" when the model is not confident.
                if confidence < 0.5:
                    intent_value = "general"

                result = QueryIntent(
                    intent=intent_value,
                    entities=entities,
                    confidence=confidence,
                )

                span.set_attribute("intent", result.intent)
                span.set_attribute("confidence", result.confidence)

                logger.info(
                    "intent_analyzer.analyzed",
                    extra={
                        "intent": result.intent,
                        "confidence": result.confidence,
                        "entity_counts": {
                            k: len(v) for k, v in result.entities.items()
                        },
                    },
                )
                return result

            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
                logger.warning(
                    "intent_analyzer.parse_failed",
                    extra={"error": str(exc)},
                )
                span.set_attribute("error", str(exc))
                return _build_fallback_intent()

            except Exception as exc:
                logger.warning(
                    "intent_analyzer.failed",
                    extra={"error": str(exc)},
                )
                span.set_attribute("error", str(exc))
                return _build_fallback_intent()
