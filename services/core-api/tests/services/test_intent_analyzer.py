"""Tests for IntentAnalyzer service."""

from __future__ import annotations

import json

import pytest

from app.services.intent_analyzer import IntentAnalyzer, QueryIntent


class TestQueryIntent:
    """Test the QueryIntent dataclass."""

    def test_create_with_relational_intent(self) -> None:
        intent = QueryIntent(
            intent="relational",
            entities={
                "people": ["Uncle Jim"],
                "places": [],
                "time_periods": [],
                "events": [],
                "objects": [],
            },
            confidence=0.9,
        )
        assert intent.intent == "relational"
        assert intent.entities["people"] == ["Uncle Jim"]
        assert intent.confidence == 0.9

    def test_create_with_temporal_intent(self) -> None:
        intent = QueryIntent(
            intent="temporal",
            entities={
                "people": [],
                "places": [],
                "time_periods": ["1970s"],
                "events": [],
                "objects": [],
            },
            confidence=0.85,
        )
        assert intent.intent == "temporal"
        assert intent.entities["time_periods"] == ["1970s"]

    def test_create_with_spatial_intent(self) -> None:
        intent = QueryIntent(
            intent="spatial",
            entities={
                "people": [],
                "places": ["Chicago"],
                "time_periods": [],
                "events": [],
                "objects": [],
            },
            confidence=0.75,
        )
        assert intent.intent == "spatial"
        assert intent.entities["places"] == ["Chicago"]

    def test_create_with_entity_focused_intent(self) -> None:
        intent = QueryIntent(
            intent="entity_focused",
            entities={
                "people": ["Grandma Rose"],
                "places": [],
                "time_periods": [],
                "events": [],
                "objects": ["wedding ring"],
            },
            confidence=0.92,
        )
        assert intent.intent == "entity_focused"
        assert intent.entities["objects"] == ["wedding ring"]

    def test_create_with_general_intent(self) -> None:
        intent = QueryIntent(
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
        assert intent.intent == "general"
        assert intent.confidence == 0.0

    def test_create_with_cross_legacy_intent(self) -> None:
        intent = QueryIntent(
            intent="cross_legacy",
            entities={
                "people": ["Dad", "Uncle Bob"],
                "places": [],
                "time_periods": [],
                "events": ["family reunion"],
                "objects": [],
            },
            confidence=0.8,
        )
        assert intent.intent == "cross_legacy"
        assert len(intent.entities["people"]) == 2

    def test_all_entity_types_present(self) -> None:
        intent = QueryIntent(
            intent="general",
            entities={
                "people": ["Alice"],
                "places": ["Boston"],
                "time_periods": ["1990s"],
                "events": ["graduation"],
                "objects": ["diploma"],
            },
            confidence=0.7,
        )
        assert set(intent.entities.keys()) == {
            "people",
            "places",
            "time_periods",
            "events",
            "objects",
        }


class TestIntentAnalyzer:
    """Test the IntentAnalyzer service."""

    @pytest.mark.asyncio
    async def test_analyze_parses_relational_intent(self) -> None:
        """Test that analyze() correctly parses a relational intent response."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "relational",
                    "entities": {
                        "people": ["Uncle Jim"],
                        "places": [],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.9,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Who was Uncle Jim to him?",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "relational"
        assert result.entities["people"] == ["Uncle Jim"]
        assert result.confidence == 0.9

    @pytest.mark.asyncio
    async def test_analyze_parses_temporal_intent(self) -> None:
        """Test that analyze() correctly parses a temporal intent response."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "temporal",
                    "entities": {
                        "people": [],
                        "places": [],
                        "time_periods": ["1970s"],
                        "events": ["retirement"],
                        "objects": [],
                    },
                    "confidence": 0.85,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="What was happening during the 1970s?",
            legacy_subject_name="Jane Doe",
        )

        assert result.intent == "temporal"
        assert result.entities["time_periods"] == ["1970s"]
        assert result.entities["events"] == ["retirement"]

    @pytest.mark.asyncio
    async def test_analyze_parses_spatial_intent(self) -> None:
        """Test that analyze() correctly parses a spatial intent response."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "spatial",
                    "entities": {
                        "people": [],
                        "places": ["Chicago"],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.78,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Tell me about his time in Chicago.",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "spatial"
        assert result.entities["places"] == ["Chicago"]

    @pytest.mark.asyncio
    async def test_analyze_parses_entity_focused_intent(self) -> None:
        """Test that analyze() correctly parses an entity_focused intent response."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "entity_focused",
                    "entities": {
                        "people": ["Grandma Rose"],
                        "places": [],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.95,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Tell me more about Grandma Rose.",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "entity_focused"
        assert result.entities["people"] == ["Grandma Rose"]
        assert result.confidence == 0.95

    @pytest.mark.asyncio
    async def test_analyze_parses_cross_legacy_intent(self) -> None:
        """Test that analyze() correctly parses a cross_legacy intent response."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "cross_legacy",
                    "entities": {
                        "people": ["Dad", "Uncle Bob"],
                        "places": [],
                        "time_periods": [],
                        "events": ["family reunion"],
                        "objects": [],
                    },
                    "confidence": 0.82,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="How did Dad and Uncle Bob get along?",
            legacy_subject_name="Jane Doe",
        )

        assert result.intent == "cross_legacy"
        assert "Dad" in result.entities["people"]
        assert "Uncle Bob" in result.entities["people"]

    @pytest.mark.asyncio
    async def test_analyze_strips_markdown_code_fences(self) -> None:
        """Test that analyze() handles markdown-fenced JSON correctly."""
        raw_json = json.dumps(
            {
                "intent": "general",
                "entities": {
                    "people": [],
                    "places": [],
                    "time_periods": [],
                    "events": [],
                    "objects": [],
                },
                "confidence": 0.6,
            }
        )
        fenced_response = f"```json\n{raw_json}\n```"
        mock_provider = _make_mock_provider(fenced_response)

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Tell me about his life.",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "general"
        assert result.confidence == 0.6

    @pytest.mark.asyncio
    async def test_analyze_falls_back_to_general_on_json_parse_error(self) -> None:
        """Test fallback to general intent when LLM returns invalid JSON."""
        mock_provider = _make_mock_provider("not valid json at all")

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Who were his closest friends?",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "general"
        assert result.confidence == 0.0
        assert result.entities == {
            "people": [],
            "places": [],
            "time_periods": [],
            "events": [],
            "objects": [],
        }

    @pytest.mark.asyncio
    async def test_analyze_falls_back_to_general_on_llm_exception(self) -> None:
        """Test fallback to general intent when LLM raises an exception."""

        async def failing_stream(**kwargs: object):  # type: ignore[return]
            raise RuntimeError("LLM service unavailable")
            yield  # make it a generator

        mock_provider = _make_mock_provider_from_generator(failing_stream)

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="What did he do for work?",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "general"
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_analyze_overrides_to_general_when_confidence_below_threshold(
        self,
    ) -> None:
        """Test that intent is overridden to general when confidence < 0.5."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "relational",
                    "entities": {
                        "people": ["someone"],
                        "places": [],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.3,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Maybe something about a person?",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "general"
        assert result.confidence == 0.3

    @pytest.mark.asyncio
    async def test_analyze_keeps_intent_at_exactly_0_5_confidence(self) -> None:
        """Test that intent is kept at exactly 0.5 confidence (boundary condition)."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "temporal",
                    "entities": {
                        "people": [],
                        "places": [],
                        "time_periods": ["1980s"],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.5,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Something about the 1980s?",
            legacy_subject_name="Jane Doe",
        )

        assert result.intent == "temporal"
        assert result.confidence == 0.5

    @pytest.mark.asyncio
    async def test_analyze_with_conversation_history(self) -> None:
        """Test that analyze() accepts and uses conversation_history."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "relational",
                    "entities": {
                        "people": ["Uncle Jim"],
                        "places": [],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.88,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="What about him?",
            legacy_subject_name="John Smith",
            conversation_history=[
                {"role": "user", "content": "Tell me about Uncle Jim."},
                {
                    "role": "assistant",
                    "content": "Uncle Jim was John's older brother.",
                },
            ],
        )

        assert result.intent == "relational"
        assert result.entities["people"] == ["Uncle Jim"]

    @pytest.mark.asyncio
    async def test_analyze_with_none_conversation_history(self) -> None:
        """Test that analyze() works when conversation_history is None."""
        mock_provider = _make_mock_provider(
            json.dumps(
                {
                    "intent": "general",
                    "entities": {
                        "people": [],
                        "places": [],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.6,
                }
            )
        )

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Tell me something.",
            legacy_subject_name="Jane Doe",
            conversation_history=None,
        )

        assert result.intent == "general"

    @pytest.mark.asyncio
    async def test_analyze_handles_chunked_llm_response(self) -> None:
        """Test that analyze() correctly assembles multi-chunk LLM output."""
        full_response = json.dumps(
            {
                "intent": "spatial",
                "entities": {
                    "people": [],
                    "places": ["New York"],
                    "time_periods": [],
                    "events": [],
                    "objects": [],
                },
                "confidence": 0.72,
            }
        )
        # Split the response into chunks as a real streaming LLM would
        chunks = [full_response[:20], full_response[20:50], full_response[50:]]
        mock_provider = _make_mock_provider_from_chunks(chunks)

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="What was life like in New York?",
            legacy_subject_name="John Smith",
        )

        assert result.intent == "spatial"
        assert result.entities["places"] == ["New York"]

    @pytest.mark.asyncio
    async def test_analyze_passes_model_id_to_llm(self) -> None:
        """Test that analyze() forwards the model_id to the LLM provider."""
        received_kwargs: dict[str, object] = {}

        async def capturing_stream(**kwargs: object):  # type: ignore[return]
            received_kwargs.update(kwargs)
            yield json.dumps(
                {
                    "intent": "general",
                    "entities": {
                        "people": [],
                        "places": [],
                        "time_periods": [],
                        "events": [],
                        "objects": [],
                    },
                    "confidence": 0.6,
                }
            )

        mock_provider = _make_mock_provider_from_generator(capturing_stream)

        analyzer = IntentAnalyzer(
            llm_provider=mock_provider, model_id="my-custom-model"
        )
        await analyzer.analyze(
            query="How was he?",
            legacy_subject_name="John Smith",
        )

        assert received_kwargs.get("model_id") == "my-custom-model"

    @pytest.mark.asyncio
    async def test_analyze_returns_all_entity_categories_on_fallback(self) -> None:
        """Test that fallback result always has all five entity categories."""
        mock_provider = _make_mock_provider("{{broken json")

        analyzer = IntentAnalyzer(llm_provider=mock_provider, model_id="test-model")
        result = await analyzer.analyze(
            query="Some query",
            legacy_subject_name="John Smith",
        )

        assert "people" in result.entities
        assert "places" in result.entities
        assert "time_periods" in result.entities
        assert "events" in result.entities
        assert "objects" in result.entities


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_provider(response: str) -> object:
    """Create a mock LLM provider that streams a single response string."""
    return _make_mock_provider_from_chunks([response])


def _make_mock_provider_from_chunks(chunks: list[str]) -> object:
    """Create a mock LLM provider that streams the given chunks."""

    async def fake_stream(**kwargs: object):  # type: ignore[return]
        for chunk in chunks:
            yield chunk

    return _make_mock_provider_from_generator(fake_stream)


def _make_mock_provider_from_generator(gen_func: object) -> object:
    """Wrap an async generator function as a minimal LLM provider mock."""

    class _MockProvider:
        stream_generate = staticmethod(gen_func)  # type: ignore[arg-type]

    return _MockProvider()
