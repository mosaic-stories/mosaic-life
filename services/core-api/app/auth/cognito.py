import logging
from functools import lru_cache
from typing import Any

import httpx
from jose import JWTError, jwk, jwt
from jose.utils import base64url_decode

from ..config import Settings
from .models import CognitoUser, TokenResponse

logger = logging.getLogger(__name__)


class CognitoError(Exception):
    """Base exception for Cognito authentication errors."""

    pass


class CognitoClient:
    """Client for AWS Cognito OIDC operations."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._jwks: dict[str, Any] | None = None

    async def fetch_jwks(self) -> dict[str, Any]:
        """Fetch JWKS (JSON Web Key Set) from Cognito.

        Returns:
            JWKS dictionary containing public keys for JWT verification.

        Raises:
            CognitoError: If JWKS cannot be fetched.
        """
        if self._jwks:
            return self._jwks

        if not self.settings.oidc_jwks_uri:
            raise CognitoError("JWKS URI not configured")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.settings.oidc_jwks_uri, timeout=10.0)
                response.raise_for_status()
                self._jwks = response.json()
                logger.info(
                    "jwks.fetched",
                    extra={"uri": self.settings.oidc_jwks_uri},
                )
                return self._jwks
        except Exception as e:
            logger.error(
                "jwks.fetch_failed",
                extra={"error": str(e), "uri": self.settings.oidc_jwks_uri},
            )
            raise CognitoError(f"Failed to fetch JWKS: {e}") from e

    async def verify_token(self, token: str) -> CognitoUser:
        """Verify and decode a Cognito JWT token.

        Args:
            token: The JWT token to verify (ID token or access token).

        Returns:
            CognitoUser with claims from the verified token.

        Raises:
            CognitoError: If token verification fails.
        """
        try:
            # Get the token header to find the key ID (kid)
            headers = jwt.get_unverified_headers(token)
            kid = headers.get("kid")
            if not kid:
                raise CognitoError("Token missing 'kid' in header")

            # Fetch JWKS and find the matching key
            jwks = await self.fetch_jwks()
            keys = jwks.get("keys", [])
            key = next((k for k in keys if k.get("kid") == kid), None)

            if not key:
                raise CognitoError(f"Public key not found for kid: {kid}")

            # Construct the public key
            public_key = jwk.construct(key)

            # Get the message and signature from token
            message, encoded_sig = token.rsplit(".", 1)
            decoded_sig = base64url_decode(encoded_sig.encode())

            # Verify signature
            if not public_key.verify(message.encode(), decoded_sig):
                raise CognitoError("Signature verification failed")

            # Decode and validate claims
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self.settings.cognito_client_id,
                issuer=self.settings.oidc_issuer,
                options={
                    "verify_signature": True,
                    "verify_aud": True,
                    "verify_iss": True,
                    "verify_exp": True,
                },
            )

            # Validate token_use claim
            token_use = claims.get("token_use")
            if token_use not in ("id", "access"):
                raise CognitoError(f"Invalid token_use: {token_use}")

            # Extract custom attributes (they come with custom: prefix)
            custom_attrs = {}
            for key, value in claims.items():
                if key.startswith("custom:"):
                    custom_attrs[key.replace("custom:", "")] = value

            # Build CognitoUser model
            user = CognitoUser(
                sub=claims["sub"],
                email=claims.get("email", ""),
                email_verified=claims.get("email_verified", False),
                given_name=claims.get("given_name"),
                family_name=claims.get("family_name"),
                name=claims.get("name"),
                relationship=custom_attrs.get("relationship"),
                iss=claims["iss"],
                aud=claims["aud"],
                exp=claims["exp"],
                iat=claims["iat"],
                token_use=token_use,
                identities=claims.get("identities"),
            )

            logger.info(
                "token.verified",
                extra={
                    "user_id": user.sub,
                    "email": user.email,
                    "token_use": token_use,
                },
            )

            return user

        except JWTError as e:
            logger.warning(
                "token.verification_failed",
                extra={"error": str(e), "error_type": type(e).__name__},
            )
            raise CognitoError(f"Token verification failed: {e}") from e
        except Exception as e:
            logger.error(
                "token.verification_error",
                extra={"error": str(e), "error_type": type(e).__name__},
            )
            raise CognitoError(f"Token verification error: {e}") from e

    async def exchange_code_for_tokens(
        self, code: str, redirect_uri: str
    ) -> TokenResponse:
        """Exchange authorization code for tokens.

        Args:
            code: Authorization code from Cognito.
            redirect_uri: The redirect URI used in the authorization request.

        Returns:
            TokenResponse containing access_token, id_token, and refresh_token.

        Raises:
            CognitoError: If token exchange fails.
        """
        if not self.settings.oidc_token_endpoint:
            raise CognitoError("Token endpoint not configured")

        if not self.settings.cognito_client_id:
            raise CognitoError("Client ID not configured")

        if not self.settings.cognito_client_secret:
            raise CognitoError("Client secret not configured")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.settings.oidc_token_endpoint,
                    data={
                        "grant_type": "authorization_code",
                        "client_id": self.settings.cognito_client_id,
                        "code": code,
                        "redirect_uri": redirect_uri,
                    },
                    auth=(
                        self.settings.cognito_client_id,
                        self.settings.cognito_client_secret,
                    ),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=10.0,
                )

                if response.status_code != 200:
                    error_data = response.json()
                    error_msg = error_data.get("error_description", "Unknown error")
                    logger.error(
                        "token.exchange_failed",
                        extra={
                            "status_code": response.status_code,
                            "error": error_msg,
                        },
                    )
                    raise CognitoError(f"Token exchange failed: {error_msg}")

                token_data = response.json()
                logger.info("token.exchange_success")

                return TokenResponse(
                    access_token=token_data["access_token"],
                    id_token=token_data["id_token"],
                    refresh_token=token_data.get("refresh_token"),
                    token_type=token_data.get("token_type", "Bearer"),
                    expires_in=token_data.get("expires_in", 3600),
                )

        except httpx.HTTPError as e:
            logger.error(
                "token.exchange_http_error",
                extra={"error": str(e)},
            )
            raise CognitoError(f"HTTP error during token exchange: {e}") from e
        except Exception as e:
            logger.error(
                "token.exchange_error",
                extra={"error": str(e)},
            )
            raise CognitoError(f"Token exchange error: {e}") from e

    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        """Refresh access and ID tokens using a refresh token.

        Args:
            refresh_token: The refresh token.

        Returns:
            TokenResponse with new access_token and id_token.

        Raises:
            CognitoError: If token refresh fails.
        """
        if not self.settings.oidc_token_endpoint:
            raise CognitoError("Token endpoint not configured")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.settings.oidc_token_endpoint,
                    data={
                        "grant_type": "refresh_token",
                        "client_id": self.settings.cognito_client_id,
                        "refresh_token": refresh_token,
                    },
                    auth=(
                        self.settings.cognito_client_id,
                        self.settings.cognito_client_secret,
                    ),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=10.0,
                )

                if response.status_code != 200:
                    error_data = response.json()
                    error_msg = error_data.get("error_description", "Unknown error")
                    logger.error(
                        "token.refresh_failed",
                        extra={
                            "status_code": response.status_code,
                            "error": error_msg,
                        },
                    )
                    raise CognitoError(f"Token refresh failed: {error_msg}")

                token_data = response.json()
                logger.info("token.refresh_success")

                return TokenResponse(
                    access_token=token_data["access_token"],
                    id_token=token_data["id_token"],
                    refresh_token=refresh_token,  # Cognito may not return new refresh token
                    token_type=token_data.get("token_type", "Bearer"),
                    expires_in=token_data.get("expires_in", 3600),
                )

        except Exception as e:
            logger.error(
                "token.refresh_error",
                extra={"error": str(e)},
            )
            raise CognitoError(f"Token refresh error: {e}") from e


@lru_cache
def get_cognito_client(settings: Settings) -> CognitoClient:
    """Get cached Cognito client instance."""
    return CognitoClient(settings)
