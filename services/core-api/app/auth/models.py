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


class OIDCUser(BaseModel):
    """User information from an OIDC userinfo endpoint (Keycloak, etc.)."""

    sub: str  # Provider's unique user ID
    email: str
    email_verified: bool = False
    name: str = ""
    given_name: str | None = None
    family_name: str | None = None
    picture: str | None = None
    preferred_username: str | None = None

    @property
    def display_name(self) -> str:
        if self.name:
            return self.name
        if self.given_name and self.family_name:
            return f"{self.given_name} {self.family_name}"
        if self.given_name:
            return self.given_name
        if self.preferred_username:
            return self.preferred_username
        return self.email.split("@")[0]


class SessionData(BaseModel):
    """Session data stored in signed cookie."""

    user_id: UUID  # Our internal user ID (from database)
    provider: str  # "google" | "keycloak"
    provider_id: str  # Sub/ID from the auth provider
    email: str
    name: str
    username: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    expires_at: datetime


class MeResponse(BaseModel):
    """Response for /api/me endpoint."""

    id: UUID  # Our internal user ID
    email: str
    name: str
    username: str | None = None
    avatar_url: str | None = None
