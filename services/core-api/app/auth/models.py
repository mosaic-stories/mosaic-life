from datetime import datetime
from typing import Any
from pydantic import BaseModel


class CognitoUser(BaseModel):
    """User information extracted from Cognito ID token."""

    sub: str  # Cognito user ID (UUID)
    email: str
    email_verified: bool = False
    given_name: str | None = None
    family_name: str | None = None
    name: str | None = None

    # Custom attributes (prefixed with custom: in JWT)
    relationship: str | None = None

    # Token metadata
    iss: str  # Issuer
    aud: str  # Audience (client ID)
    exp: int  # Expiration timestamp
    iat: int  # Issued at timestamp
    token_use: str = "id"  # Should be "id" for ID token

    # Identity provider info
    identities: list[dict[str, Any]] | None = None

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

    user_id: str  # Cognito sub
    email: str
    name: str
    created_at: datetime
    expires_at: datetime

    # Store minimal token info for refresh
    id_token: str
    access_token: str
    refresh_token: str | None = None


class MeResponse(BaseModel):
    """Response for /api/me endpoint."""

    id: str
    email: str
    name: str | None = None
    email_verified: bool = False
    given_name: str | None = None
    family_name: str | None = None


class TokenResponse(BaseModel):
    """OAuth token response from Cognito."""

    access_token: str
    id_token: str
    refresh_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int
