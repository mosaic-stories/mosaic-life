from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class GoogleUser(BaseModel):
    """User information from Google OAuth userinfo endpoint."""

    id: str  # Google user ID
    email: str
    verified_email: bool = False
    name: str
    given_name: str | None = None
    family_name: str | None = None
    picture: str | None = None  # Avatar URL

    @property
    def display_name(self) -> str:
        """Compute display name from available fields."""
        if self.name:
            return self.name
        if self.given_name and self.family_name:
            return f"{self.given_name} {self.family_name}"
        if self.given_name:
            return self.given_name
        return self.email.split("@")[0]


class SessionData(BaseModel):
    """Session data stored in encrypted cookie."""

    user_id: UUID  # Our internal user ID (from database)
    google_id: str  # Google user ID
    email: str
    name: str
    avatar_url: str | None = None
    created_at: datetime
    expires_at: datetime


class MeResponse(BaseModel):
    """Response for /api/me endpoint."""

    id: UUID  # Our internal user ID
    email: str
    name: str
    avatar_url: str | None = None
