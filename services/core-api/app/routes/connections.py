"""API routes for Connections Hub."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.connections import (
    ConnectionsStatsResponse,
    FavoritePersonaResponse,
    PeopleCounts,
    PeopleResponse,
    PersonConnectionResponse,
    SharedLegacySummary,
    TopConnectionResponse,
)
from ..services import connections as connections_service

router = APIRouter(prefix="/api/connections", tags=["connections"])
logger = logging.getLogger(__name__)


@router.get(
    "/stats",
    response_model=ConnectionsStatsResponse,
    summary="Get connections stats",
    description="Get connection-specific statistics for the authenticated user.",
)
async def get_connections_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectionsStatsResponse:
    """Get connections stats for the current user."""
    session = require_auth(request)
    result = await connections_service.get_connections_stats(
        db=db, user_id=session.user_id
    )
    return ConnectionsStatsResponse(**result)


@router.get(
    "/top-connections",
    response_model=list[TopConnectionResponse],
    summary="Get top connections",
    description="Get people the user shares the most legacies with.",
)
async def get_top_connections(
    request: Request,
    limit: int = Query(default=6, ge=1, le=20, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[TopConnectionResponse]:
    """Get top connections for the current user."""
    session = require_auth(request)
    items = await connections_service.get_top_connections(
        db=db, user_id=session.user_id, limit=limit
    )
    return [TopConnectionResponse(**item) for item in items]


@router.get(
    "/favorite-personas",
    response_model=list[FavoritePersonaResponse],
    summary="Get favorite personas",
    description="Get personas ranked by conversation count.",
)
async def get_favorite_personas(
    request: Request,
    limit: int = Query(default=4, ge=1, le=10, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[FavoritePersonaResponse]:
    """Get favorite personas for the current user."""
    session = require_auth(request)
    items = await connections_service.get_favorite_personas(
        db=db, user_id=session.user_id, limit=limit
    )
    return [FavoritePersonaResponse(**item) for item in items]


@router.get(
    "/people",
    response_model=PeopleResponse,
    summary="Get people connections",
    description="Get the user's human connections with shared legacy details.",
)
async def get_people(
    request: Request,
    filter: Literal["all", "co_creators", "collaborators"] = Query(
        default="all", description="Filter connections"
    ),
    db: AsyncSession = Depends(get_db),
) -> PeopleResponse:
    """Get people connections for the current user."""
    session = require_auth(request)
    result = await connections_service.get_people(
        db=db, user_id=session.user_id, filter_key=filter
    )
    items = [
        PersonConnectionResponse(
            shared_legacies=[
                SharedLegacySummary(**sl) for sl in item["shared_legacies"]
            ],
            **{k: v for k, v in item.items() if k != "shared_legacies"},
        )
        for item in result["items"]
    ]
    return PeopleResponse(
        items=items,
        counts=PeopleCounts(**result["counts"]),
    )
