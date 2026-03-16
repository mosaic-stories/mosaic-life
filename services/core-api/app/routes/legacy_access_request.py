"""Legacy access request API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.legacy_access_request import (
    LegacyAccessRequestCreate,
    LegacyAccessRequestResponse,
    OutgoingAccessRequestResponse,
)
from ..services import legacy_access_request as service

router = APIRouter(tags=["legacy-access"])


@router.post(
    "/api/legacies/{legacy_id}/access-requests",
    response_model=LegacyAccessRequestResponse,
)
async def submit_request(
    legacy_id: UUID,
    data: LegacyAccessRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LegacyAccessRequestResponse:
    session = require_auth(request)
    return await service.submit_request(
        db, session.user_id, legacy_id, data.requested_role, data.message
    )


@router.get(
    "/api/legacies/{legacy_id}/access-requests",
    response_model=list[LegacyAccessRequestResponse],
)
async def list_pending(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[LegacyAccessRequestResponse]:
    session = require_auth(request)
    return await service.list_pending(db, legacy_id, session.user_id)


class ApproveRequest(BaseModel):
    assigned_role: str | None = Field(None, pattern="^(advocate|admirer|admin)$")


@router.patch(
    "/api/legacies/{legacy_id}/access-requests/{request_id}/approve",
    response_model=LegacyAccessRequestResponse,
)
async def approve_request(
    legacy_id: UUID,
    request_id: UUID,
    data: ApproveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LegacyAccessRequestResponse:
    session = require_auth(request)
    return await service.approve_request(
        db, legacy_id, request_id, session.user_id, data.assigned_role
    )


@router.patch("/api/legacies/{legacy_id}/access-requests/{request_id}/decline")
async def decline_request(
    legacy_id: UUID,
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    session = require_auth(request)
    await service.decline_request(db, legacy_id, request_id, session.user_id)
    return {"status": "declined"}


@router.get(
    "/api/access-requests/outgoing",
    response_model=list[OutgoingAccessRequestResponse],
)
async def list_outgoing(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[OutgoingAccessRequestResponse]:
    session = require_auth(request)
    return await service.list_outgoing(db, session.user_id)
