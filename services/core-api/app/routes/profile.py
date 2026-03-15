"""User profile API routes."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import get_current_session, require_auth
from ..database import get_db
from ..schemas.profile import (
    ProfileResponse,
    ProfileSettingsResponse,
    ProfileSettingsUpdate,
)
from ..services import profile as profile_service

router = APIRouter(prefix="/api/users", tags=["profiles"])


class UsernameUpdate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)


@router.get("/{username}", response_model=ProfileResponse)
async def get_profile(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """Get a user's profile page data, filtered by viewer authorization."""
    session = get_current_session(request)
    viewer_user_id = session.user_id if session else None

    result = await profile_service.get_profile_by_username(db, username, viewer_user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.patch("/me/username")
async def update_username(
    data: UsernameUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Change the current user's username."""
    session = require_auth(request)
    await profile_service.update_username(db, session.user_id, data.username)
    return {"username": data.username}


@router.patch("/me/profile/settings", response_model=ProfileSettingsResponse)
async def update_visibility_settings(
    data: ProfileSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ProfileSettingsResponse:
    """Update profile visibility settings."""
    session = require_auth(request)
    update_kwargs = {k: v for k, v in data.model_dump().items() if v is not None}
    return await profile_service.update_visibility_settings(
        db, session.user_id, **update_kwargs
    )
