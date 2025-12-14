"""Routes for user settings, preferences, and profile."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.preferences import (
    PreferencesResponse,
    PreferencesUpdateRequest,
    ProfileResponse,
    ProfileUpdateRequest,
)
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
