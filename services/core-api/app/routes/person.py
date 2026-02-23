"""Person API routes."""

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.person import PersonMatchResponse
from ..services.person import find_match_candidates

router = APIRouter(prefix="/api/persons", tags=["persons"])
logger = logging.getLogger(__name__)


@router.get(
    "/match-candidates",
    response_model=PersonMatchResponse,
    summary="Find potential Person matches",
)
async def get_match_candidates(
    request: Request,
    name: str = Query(..., min_length=1, max_length=200, description="Name to match"),
    birth_date: date | None = Query(None, description="Birth date for scoring"),
    death_date: date | None = Query(None, description="Death date for scoring"),
    db: AsyncSession = Depends(get_db),
) -> PersonMatchResponse:
    session = require_auth(request)

    logger.info(
        "person.match_candidates",
        extra={
            "user_id": str(session.user_id),
            "search_name": name,
        },
    )

    candidates = await find_match_candidates(
        db=db,
        name=name,
        birth_date=birth_date,
        death_date=death_date,
    )

    return PersonMatchResponse(candidates=candidates)
