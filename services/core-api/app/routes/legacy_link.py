"""Legacy Link API routes."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..models.legacy_link import LegacyLink
from ..schemas.legacy_link import (
    LegacyLinkCreate,
    LegacyLinkRespond,
    LegacyLinkResponse,
    LegacyLinkShareCreate,
    LegacyLinkShareModeUpdate,
    LegacyLinkShareResponse,
)
from ..services.legacy_link import (
    create_link_request,
    get_link_detail,
    list_links_for_user,
    list_shares,
    respond_to_link,
    revoke_link,
    share_resource,
    unshare_resource,
    update_share_mode,
)

router = APIRouter(prefix="/api/legacy-links", tags=["legacy-links"])
logger = logging.getLogger(__name__)


def _enrich_link_response(link: LegacyLink) -> LegacyLinkResponse:
    """Build an enriched LegacyLinkResponse from a loaded LegacyLink ORM object."""
    return LegacyLinkResponse(
        id=link.id,
        person_id=link.person_id,
        requester_legacy_id=link.requester_legacy_id,
        target_legacy_id=link.target_legacy_id,
        status=link.status,
        requester_share_mode=link.requester_share_mode,
        target_share_mode=link.target_share_mode,
        requested_by=link.requested_by,
        responded_by=link.responded_by,
        requested_at=link.requested_at,
        responded_at=link.responded_at,
        revoked_at=link.revoked_at,
        requester_legacy_name=link.requester_legacy.name
        if link.requester_legacy
        else None,
        target_legacy_name=link.target_legacy.name if link.target_legacy else None,
        person_name=link.person.canonical_name if link.person else None,
    )


@router.post(
    "/",
    response_model=LegacyLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a legacy link request",
)
async def create_link(
    request: Request,
    body: LegacyLinkCreate,
    requester_legacy_id: UUID = Query(..., description="Legacy ID of the requester"),
    db: AsyncSession = Depends(get_db),
) -> LegacyLinkResponse:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.create",
        extra={
            "user_id": str(user_id),
            "requester_legacy_id": str(requester_legacy_id),
            "target_legacy_id": str(body.target_legacy_id),
        },
    )

    link = await create_link_request(
        db=db,
        user_id=user_id,
        requester_legacy_id=requester_legacy_id,
        target_legacy_id=body.target_legacy_id,
        person_id=body.person_id,
    )

    # Reload with relationships for enriched response
    enriched = await get_link_detail(db=db, user_id=user_id, link_id=link.id)
    return _enrich_link_response(enriched)


@router.get(
    "/",
    response_model=list[LegacyLinkResponse],
    summary="List legacy links for the authenticated user",
)
async def list_links(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[LegacyLinkResponse]:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.list",
        extra={"user_id": str(user_id)},
    )

    links = await list_links_for_user(db=db, user_id=user_id)
    return [_enrich_link_response(link) for link in links]


@router.get(
    "/{link_id}",
    response_model=LegacyLinkResponse,
    summary="Get link detail",
)
async def get_link(
    request: Request,
    link_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> LegacyLinkResponse:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.get",
        extra={"user_id": str(user_id), "link_id": str(link_id)},
    )

    link = await get_link_detail(db=db, user_id=user_id, link_id=link_id)
    return _enrich_link_response(link)


@router.patch(
    "/{link_id}/respond",
    response_model=LegacyLinkResponse,
    summary="Accept or reject a pending link request",
)
async def respond_link(
    request: Request,
    link_id: UUID,
    body: LegacyLinkRespond,
    db: AsyncSession = Depends(get_db),
) -> LegacyLinkResponse:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.respond",
        extra={
            "user_id": str(user_id),
            "link_id": str(link_id),
            "action": body.action,
        },
    )

    link = await respond_to_link(
        db=db,
        user_id=user_id,
        link_id=link_id,
        action=body.action,
    )

    enriched = await get_link_detail(db=db, user_id=user_id, link_id=link.id)
    return _enrich_link_response(enriched)


@router.patch(
    "/{link_id}/revoke",
    response_model=LegacyLinkResponse,
    summary="Revoke an active legacy link",
)
async def revoke_link_endpoint(
    request: Request,
    link_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> LegacyLinkResponse:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.revoke",
        extra={"user_id": str(user_id), "link_id": str(link_id)},
    )

    link = await revoke_link(db=db, user_id=user_id, link_id=link_id)

    enriched = await get_link_detail(db=db, user_id=user_id, link_id=link.id)
    return _enrich_link_response(enriched)


@router.patch(
    "/{link_id}/share-mode",
    response_model=LegacyLinkResponse,
    summary="Update the caller's share mode for a link",
)
async def update_link_share_mode(
    request: Request,
    link_id: UUID,
    body: LegacyLinkShareModeUpdate,
    db: AsyncSession = Depends(get_db),
) -> LegacyLinkResponse:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.update_share_mode",
        extra={
            "user_id": str(user_id),
            "link_id": str(link_id),
            "mode": body.mode,
        },
    )

    link = await update_share_mode(
        db=db,
        user_id=user_id,
        link_id=link_id,
        mode=body.mode,
    )

    enriched = await get_link_detail(db=db, user_id=user_id, link_id=link.id)
    return _enrich_link_response(enriched)


@router.post(
    "/{link_id}/shares",
    response_model=LegacyLinkShareResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Share a resource via a legacy link",
)
async def share_link_resource(
    request: Request,
    link_id: UUID,
    body: LegacyLinkShareCreate,
    db: AsyncSession = Depends(get_db),
) -> LegacyLinkShareResponse:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.share_resource",
        extra={
            "user_id": str(user_id),
            "link_id": str(link_id),
            "resource_type": body.resource_type,
            "resource_id": str(body.resource_id),
        },
    )

    share = await share_resource(
        db=db,
        user_id=user_id,
        link_id=link_id,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
    )

    return LegacyLinkShareResponse.model_validate(share)


@router.delete(
    "/{link_id}/shares/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unshare a resource from a legacy link",
)
async def unshare_link_resource(
    request: Request,
    link_id: UUID,
    share_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.unshare_resource",
        extra={
            "user_id": str(user_id),
            "link_id": str(link_id),
            "share_id": str(share_id),
        },
    )

    await unshare_resource(
        db=db,
        user_id=user_id,
        link_id=link_id,
        share_id=share_id,
    )


@router.get(
    "/{link_id}/shares",
    response_model=list[LegacyLinkShareResponse],
    summary="List shared resources for a legacy link",
)
async def list_link_shares(
    request: Request,
    link_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[LegacyLinkShareResponse]:
    session = require_auth(request)
    user_id = session.user_id

    logger.info(
        "legacy_link.list_shares",
        extra={"user_id": str(user_id), "link_id": str(link_id)},
    )

    shares = await list_shares(db=db, user_id=user_id, link_id=link_id)
    return [LegacyLinkShareResponse.model_validate(s) for s in shares]
