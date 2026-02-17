"""API routes for story evolution workflow."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.schemas.story_evolution import (
    EvolutionSessionCreate,
    EvolutionSessionResponse,
    PhaseAdvanceRequest,
)
from app.services import story_evolution as evolution_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}/evolution", tags=["evolution"])


@router.post("", status_code=201, response_model=EvolutionSessionResponse)
async def start_evolution(
    story_id: UUID,
    data: EvolutionSessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Start a new evolution session for a story."""
    session_data = require_auth(request)
    evo_session = await evolution_service.start_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
        persona_id=data.persona_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.get("/active", response_model=EvolutionSessionResponse)
async def get_active_session(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Get the active evolution session for a story."""
    session_data = require_auth(request)
    evo_session = await evolution_service.get_active_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    if not evo_session:
        raise HTTPException(status_code=404, detail="No active evolution session")
    return EvolutionSessionResponse.model_validate(evo_session)


@router.patch(
    "/{session_id}/phase",
    response_model=EvolutionSessionResponse,
)
async def advance_phase(
    story_id: UUID,
    session_id: UUID,
    data: PhaseAdvanceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Advance the evolution session phase."""
    session_data = require_auth(request)
    evo_session = await evolution_service.advance_phase(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
        target_phase=data.phase,
        summary_text=data.summary_text,
        writing_style=data.writing_style,
        length_preference=data.length_preference,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post(
    "/{session_id}/discard",
    response_model=EvolutionSessionResponse,
)
async def discard_session(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Discard an evolution session."""
    session_data = require_auth(request)
    evo_session = await evolution_service.discard_session(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post(
    "/{session_id}/accept",
    response_model=EvolutionSessionResponse,
)
async def accept_session(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Accept the draft and complete the session."""
    session_data = require_auth(request)
    evo_session = await evolution_service.accept_session(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)
