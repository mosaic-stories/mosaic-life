"""Routes for user settings, preferences, and profile."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..auth.session_tokens import (
    extract_client_ip,
    extract_device_info,
    get_session_token_hash,
)
from ..config import get_settings
from ..database import get_db
from ..schemas.account import (
    AccountDeletionTokenResponse,
    ActionStatusResponse,
    DataExportRequestResponse,
    DeleteAccountRequest,
)
from ..schemas.preferences import (
    PreferencesResponse,
    PreferencesUpdateRequest,
    ProfileResponse,
    ProfileUpdateRequest,
)
from ..schemas.session import SessionListResponse
from ..schemas.stats import UserStatsResponse
from ..services import settings as settings_service

router = APIRouter(prefix="/api/users/me", tags=["settings"])


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    """Get current user's preferences."""
    session = require_auth(request)
    try:
        return await settings_service.get_user_preferences(db, session.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    data: PreferencesUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    """Update current user's preferences."""
    session = require_auth(request)
    try:
        return await settings_service.update_user_preferences(db, session.user_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """Get current user's profile."""
    session = require_auth(request)
    try:
        return await settings_service.get_user_profile(db, session.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/profile", response_model=ProfileResponse)
async def update_profile(
    data: ProfileUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """Update current user's profile."""
    session = require_auth(request)
    try:
        return await settings_service.update_user_profile(db, session.user_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stats", response_model=UserStatsResponse)
async def get_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UserStatsResponse:
    """Get current user's usage statistics."""
    session = require_auth(request)
    try:
        return await settings_service.get_user_stats(db, session.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/sessions", response_model=SessionListResponse)
async def get_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SessionListResponse:
    """Get current user's active sessions."""
    session = require_auth(request)
    token_hash = get_session_token_hash(request)

    if token_hash:
        await settings_service.upsert_user_session(
            db=db,
            user_id=session.user_id,
            session_token_hash=token_hash,
            device_info=extract_device_info(request),
            ip_address=extract_client_ip(request),
        )

    return await settings_service.get_user_sessions(db, session.user_id, token_hash)


@router.delete("/sessions/{session_id}", response_model=ActionStatusResponse)
async def revoke_session(
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ActionStatusResponse:
    """Revoke a non-current active session."""
    session = require_auth(request)
    token_hash = get_session_token_hash(request)
    try:
        await settings_service.revoke_user_session(
            db=db,
            user_id=session.user_id,
            session_id=session_id,
            current_session_token_hash=token_hash,
        )
    except PermissionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return ActionStatusResponse(status="ok")


@router.post("/export", response_model=DataExportRequestResponse)
async def request_export(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> DataExportRequestResponse:
    """Request an account data export and email a download link."""
    session = require_auth(request)
    try:
        download_url, expires_at = await settings_service.request_user_data_export(
            db=db,
            user_id=session.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return DataExportRequestResponse(
        status="queued",
        download_url=download_url,
        expires_at=expires_at,
    )


@router.get("/export/{token}")
async def download_export(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get account export payload using a valid export token."""
    session = require_auth(request)
    try:
        return await settings_service.get_user_data_export(
            db=db,
            user_id=session.user_id,
            token=token,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/delete-token", response_model=AccountDeletionTokenResponse)
async def create_delete_token(request: Request) -> AccountDeletionTokenResponse:
    """Create a short-lived token required for account deletion."""
    session = require_auth(request)
    token, expires_at = settings_service.create_account_deletion_token(session.user_id)
    return AccountDeletionTokenResponse(token=token, expires_at=expires_at)


@router.delete("", response_model=ActionStatusResponse)
async def delete_account(
    data: DeleteAccountRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> ActionStatusResponse:
    """Delete the current user's account."""
    session = require_auth(request)
    try:
        await settings_service.delete_user_account(db, session.user_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        domain=settings.session_cookie_domain,
    )

    return ActionStatusResponse(status="deleted")
