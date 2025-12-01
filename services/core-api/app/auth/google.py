"""Google OAuth 2.0 client for authentication."""

import logging
from typing import Any

import httpx
from authlib.integrations.starlette_client import OAuth

from ..config import Settings

logger = logging.getLogger(__name__)


class GoogleOAuthError(Exception):
    """Base exception for Google OAuth errors."""

    pass


class GoogleOAuthClient:
    """Client for Google OAuth 2.0 authentication flow."""

    def __init__(self, settings: Settings):
        """Initialize Google OAuth client.

        Args:
            settings: Application settings containing Google OAuth credentials
        """
        self.settings = settings
        self.client_id = settings.google_client_id
        self.client_secret = settings.google_client_secret

        if not self.client_id or not self.client_secret:
            raise ValueError("Google OAuth credentials not configured")

        # Initialize OAuth client
        self.oauth = OAuth()  # type: ignore[no-untyped-call]
        self.oauth.register(
            name="google",
            client_id=self.client_id,
            client_secret=self.client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    async def exchange_code_for_tokens(
        self, code: str, redirect_uri: str
    ) -> dict[str, Any]:
        """Exchange authorization code for access and ID tokens.

        Args:
            code: Authorization code from Google
            redirect_uri: The redirect URI used in the authorization request

        Returns:
            Token response containing access_token, id_token, etc.

        Raises:
            GoogleOAuthError: If token exchange fails
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.settings.google_token_url,
                    data={
                        "code": code,
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                if response.status_code != 200:
                    logger.error(
                        "google.token_exchange.failed",
                        extra={
                            "status_code": response.status_code,
                            "response": response.text,
                        },
                    )
                    raise GoogleOAuthError(f"Token exchange failed: {response.text}")

                result: dict[str, Any] = response.json()
                return result

        except httpx.HTTPError as e:
            logger.error(
                "google.token_exchange.http_error",
                extra={"error": str(e)},
            )
            raise GoogleOAuthError(f"HTTP error during token exchange: {e}") from e

    async def get_user_info(self, access_token: str) -> dict[str, Any]:
        """Get user information from Google using access token.

        Args:
            access_token: Access token from Google

        Returns:
            User information dict with id, email, name, picture, etc.

        Raises:
            GoogleOAuthError: If fetching user info fails
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.settings.google_userinfo_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )

                if response.status_code != 200:
                    logger.error(
                        "google.userinfo.failed",
                        extra={
                            "status_code": response.status_code,
                            "response": response.text,
                        },
                    )
                    raise GoogleOAuthError(
                        f"Failed to fetch user info: {response.text}"
                    )

                user_info: dict[str, Any] = response.json()
                
                # Log what we received from Google (for debugging avatar issues)
                logger.info(
                    "google.userinfo.received",
                    extra={
                        "has_picture": "picture" in user_info,
                        "picture_url": user_info.get("picture", "NOT_PROVIDED")[:100] if "picture" in user_info else None,
                        "user_id": user_info.get("sub"),
                        "email": user_info.get("email"),
                    },
                )
                
                return user_info

        except httpx.HTTPError as e:
            logger.error(
                "google.userinfo.http_error",
                extra={"error": str(e)},
            )
            raise GoogleOAuthError(f"HTTP error fetching user info: {e}") from e


def get_google_client(settings: Settings) -> GoogleOAuthClient:
    """Get Google OAuth client instance.

    Args:
        settings: Application settings

    Returns:
        GoogleOAuthClient instance
    """
    return GoogleOAuthClient(settings)
