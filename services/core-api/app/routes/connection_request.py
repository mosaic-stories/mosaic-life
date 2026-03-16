"""Connection request and connection management API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.connection import (
    ConnectionDetailResponse,
    ConnectionRequestCreate,
    ConnectionRequestResponse,
    ConnectionResponse,
)
from ..services import connection as connection_service
from ..services import connection_request as request_service

router = APIRouter(tags=["connections"])


# --- Connection Requests ---


@router.post("/api/connections/requests", response_model=ConnectionRequestResponse)
async def create_request(
    data: ConnectionRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectionRequestResponse:
    session = require_auth(request)
    return await request_service.create_request(
        db, session.user_id, data.to_user_id, data.relationship_type, data.message
    )


@router.get(
    "/api/connections/requests/incoming",
    response_model=list[ConnectionRequestResponse],
)
async def list_incoming(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ConnectionRequestResponse]:
    session = require_auth(request)
    return await request_service.list_incoming(db, session.user_id)


@router.get(
    "/api/connections/requests/outgoing",
    response_model=list[ConnectionRequestResponse],
)
async def list_outgoing(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ConnectionRequestResponse]:
    session = require_auth(request)
    return await request_service.list_outgoing(db, session.user_id)


@router.patch(
    "/api/connections/requests/{request_id}/accept",
    response_model=ConnectionResponse,
)
async def accept_request(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectionResponse:
    session = require_auth(request)
    return await request_service.accept_request(db, request_id, session.user_id)


@router.patch("/api/connections/requests/{request_id}/decline")
async def decline_request(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    session = require_auth(request)
    await request_service.decline_request(db, request_id, session.user_id)
    return {"status": "declined"}


@router.delete("/api/connections/requests/{request_id}")
async def cancel_request(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    session = require_auth(request)
    await request_service.cancel_request(db, request_id, session.user_id)
    return {"status": "cancelled"}


# --- Connections ---


@router.get("/api/connections/list", response_model=list[ConnectionResponse])
async def list_connections(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ConnectionResponse]:
    session = require_auth(request)
    return await connection_service.list_connections(db, session.user_id)


@router.delete("/api/connections/{connection_id}")
async def remove_connection(
    connection_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    session = require_auth(request)
    await connection_service.remove_connection(db, connection_id, session.user_id)
    return {"status": "removed"}


class RelationshipUpdate(BaseModel):
    relationship_type: str | None = Field(None, max_length=50)
    who_they_are_to_me: str | None = Field(None, max_length=1000)
    who_i_am_to_them: str | None = Field(None, max_length=1000)
    nicknames: list[str] | None = None
    character_traits: list[str] | None = None


@router.get(
    "/api/connections/{connection_id}/relationship",
    response_model=ConnectionDetailResponse,
)
async def get_relationship(
    connection_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectionDetailResponse:
    session = require_auth(request)
    return await connection_service.get_relationship(db, connection_id, session.user_id)


@router.patch(
    "/api/connections/{connection_id}/relationship",
    response_model=ConnectionDetailResponse,
)
async def update_relationship(
    connection_id: UUID,
    data: RelationshipUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectionDetailResponse:
    session = require_auth(request)
    return await connection_service.update_relationship(
        db,
        connection_id,
        session.user_id,
        relationship_type=data.relationship_type,
        who_they_are_to_me=data.who_they_are_to_me,
        who_i_am_to_them=data.who_i_am_to_them,
        nicknames=data.nicknames,
        character_traits=data.character_traits,
        fields_set=data.model_fields_set,
    )
