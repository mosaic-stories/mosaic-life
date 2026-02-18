"""Tests for story evolution Pydantic schemas."""

import uuid
from datetime import datetime, timezone

import pytest

from app.schemas.story_evolution import (
    EvolutionSessionCreate,
    EvolutionSessionResponse,
    PhaseAdvanceRequest,
    RevisionRequest,
)


class TestEvolutionSessionCreate:
    def test_valid_create(self) -> None:
        data = EvolutionSessionCreate(persona_id="biographer")
        assert data.persona_id == "biographer"

    def test_persona_id_required(self) -> None:
        with pytest.raises(Exception):
            EvolutionSessionCreate()  # type: ignore[call-arg]


class TestPhaseAdvanceRequest:
    def test_advance_to_summary(self) -> None:
        req = PhaseAdvanceRequest(
            phase="summary",
            summary_text="## New Details\n- Uncle Ray was present",
        )
        assert req.phase == "summary"
        assert req.summary_text is not None

    def test_advance_to_style_selection(self) -> None:
        req = PhaseAdvanceRequest(
            phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )
        assert req.writing_style == "vivid"
        assert req.length_preference == "similar"

    def test_advance_to_elicitation(self) -> None:
        req = PhaseAdvanceRequest(phase="elicitation")
        assert req.phase == "elicitation"

    def test_invalid_phase(self) -> None:
        with pytest.raises(Exception):
            PhaseAdvanceRequest(phase="invalid_phase")

    def test_invalid_writing_style(self) -> None:
        with pytest.raises(Exception):
            PhaseAdvanceRequest(
                phase="style_selection",
                writing_style="invalid_style",
                length_preference="similar",
            )


class TestRevisionRequest:
    def test_valid_revision(self) -> None:
        req = RevisionRequest(instructions="Make paragraph two longer")
        assert req.instructions == "Make paragraph two longer"

    def test_empty_instructions_rejected(self) -> None:
        with pytest.raises(Exception):
            RevisionRequest(instructions="")


class TestEvolutionSessionResponse:
    def test_from_model(self) -> None:
        now = datetime.now(tz=timezone.utc)
        resp = EvolutionSessionResponse(
            id=uuid.uuid4(),
            story_id=uuid.uuid4(),
            base_version_number=1,
            conversation_id=uuid.uuid4(),
            draft_version_id=None,
            phase="elicitation",
            summary_text=None,
            writing_style=None,
            length_preference=None,
            revision_count=0,
            created_by=uuid.uuid4(),
            created_at=now,
            updated_at=now,
        )
        assert resp.phase == "elicitation"
        assert resp.draft_version_id is None
