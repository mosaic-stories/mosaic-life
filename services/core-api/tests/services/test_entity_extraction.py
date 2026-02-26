"""Tests for EntityExtractionService."""

from __future__ import annotations

import json

import pytest
from unittest.mock import AsyncMock

from app.services.entity_extraction import (
    EntityExtractionService,
    ExtractedEntities,
    ExtractedEntity,
)


class TestExtractedEntities:
    """Test the extraction data model."""

    def test_filter_by_confidence(self) -> None:
        entities = ExtractedEntities(
            people=[
                ExtractedEntity(name="Jim", context="uncle", confidence=0.9),
                ExtractedEntity(name="Someone", context="unknown", confidence=0.3),
            ],
            places=[],
            events=[],
            objects=[],
            time_references=[],
        )
        filtered = entities.filter_by_confidence(0.7)
        assert len(filtered.people) == 1
        assert filtered.people[0].name == "Jim"


class TestEntityExtractionService:
    """Test the extraction pipeline."""

    @pytest.mark.asyncio
    async def test_extract_entities_parses_llm_response(self) -> None:
        mock_provider = AsyncMock()
        llm_response = json.dumps(
            {
                "people": [
                    {"name": "Uncle Jim", "context": "brother", "confidence": 0.95}
                ],
                "places": [
                    {
                        "name": "Chicago",
                        "type": "city",
                        "location": "IL",
                        "confidence": 0.9,
                    }
                ],
                "events": [],
                "objects": [],
                "time_references": [{"period": "1980s", "context": "childhood"}],
            }
        )

        mock_chunks: list[str] = [llm_response]

        async def fake_stream(**kwargs: object):  # type: ignore[return]
            for c in mock_chunks:
                yield c

        mock_provider.stream_generate = fake_stream

        service = EntityExtractionService(
            llm_provider=mock_provider,
            model_id="test-model",
        )
        result = await service.extract_entities(
            "A story about Uncle Jim in Chicago in the 1980s."
        )

        assert len(result.people) == 1
        assert result.people[0].name == "Uncle Jim"
        assert len(result.places) == 1
        assert result.places[0].name == "Chicago"

    @pytest.mark.asyncio
    async def test_extract_entities_returns_empty_on_failure(self) -> None:
        mock_provider = AsyncMock()

        async def fail_stream(**kwargs: object):  # type: ignore[return]
            yield "not valid json"

        mock_provider.stream_generate = fail_stream

        service = EntityExtractionService(
            llm_provider=mock_provider,
            model_id="test-model",
        )
        result = await service.extract_entities("Some content")
        assert len(result.people) == 0
        assert len(result.places) == 0
