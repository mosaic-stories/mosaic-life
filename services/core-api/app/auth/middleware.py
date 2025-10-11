import logging
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from ..config import Settings, get_settings
from .cognito import CognitoError, get_cognito_client
from .models import CognitoUser

logger = logging.getLogger(__name__)


class SessionMiddleware(BaseHTTPMiddleware):
    """Middleware to handle session cookie validation and user authentication.

    This middleware:
    1. Checks for session cookie on requests
    2. Validates and decrypts the session cookie
    3. Verifies the JWT token stored in session
    4. Attaches authenticated user to request state
    5. Handles token refresh if needed
    """

    def __init__(self, app: ASGIApp, settings: Settings | None = None) -> None:
        super().__init__(app)
        self.settings = settings or get_settings()
        self.signer = TimestampSigner(self.settings.session_secret_key)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Process request and validate session."""

        # Skip auth for public endpoints
        if self._is_public_path(request.url.path):
            return await call_next(request)

        # Check if Cognito auth is enabled
        if not self.settings.enable_cognito_auth:
            # In dev mode, pass through without auth
            return await call_next(request)

        # Get session cookie
        session_cookie = request.cookies.get(self.settings.session_cookie_name)

        if session_cookie:
            try:
                # Validate and extract ID token from session
                id_token = self._validate_session_cookie(session_cookie)

                # Verify JWT token
                cognito_client = get_cognito_client(self.settings)
                user = await cognito_client.verify_token(id_token)

                # Attach user to request state
                request.state.user = user
                request.state.authenticated = True

                logger.debug(
                    "session.validated",
                    extra={"user_id": user.sub, "path": request.url.path},
                )

            except (SignatureExpired, BadSignature) as e:
                logger.warning(
                    "session.invalid_cookie",
                    extra={"error": str(e), "path": request.url.path},
                )
                request.state.authenticated = False
            except CognitoError as e:
                logger.warning(
                    "session.token_invalid",
                    extra={"error": str(e), "path": request.url.path},
                )
                request.state.authenticated = False
            except Exception as e:
                logger.error(
                    "session.validation_error",
                    extra={"error": str(e), "path": request.url.path},
                )
                request.state.authenticated = False
        else:
            request.state.authenticated = False

        return await call_next(request)

    def _validate_session_cookie(self, cookie_value: str) -> str:
        """Validate and extract ID token from session cookie.

        Args:
            cookie_value: The encrypted session cookie value.

        Returns:
            The ID token string.

        Raises:
            SignatureExpired: If the cookie has expired.
            BadSignature: If the cookie signature is invalid.
        """
        # Unsign the cookie with max age validation
        unsigned_value = self.signer.unsign(
            cookie_value,
            max_age=self.settings.session_cookie_max_age,
        )
        # Cookie contains just the ID token for now
        # In production, you might want to store more session data
        return unsigned_value.decode("utf-8")

    def _is_public_path(self, path: str) -> bool:
        """Check if the path is a public endpoint that doesn't require auth."""
        public_paths = [
            "/healthz",
            "/readyz",
            "/metrics",
            "/api/auth/login",
            "/api/auth/callback",
            "/api/auth/logout",
            "/",
        ]
        return any(path.startswith(p) for p in public_paths)


def create_session_cookie(
    settings: Settings,
    id_token: str,
) -> tuple[str, str]:
    """Create a signed session cookie.

    Args:
        settings: Application settings.
        id_token: The Cognito ID token to store in the session.

    Returns:
        Tuple of (cookie_name, cookie_value).
    """
    signer = TimestampSigner(settings.session_secret_key)
    signed_token = signer.sign(id_token.encode("utf-8")).decode("utf-8")

    return settings.session_cookie_name, signed_token


def get_current_user(request: Request) -> CognitoUser | None:
    """Get the current authenticated user from request state.

    Args:
        request: FastAPI request object.

    Returns:
        CognitoUser if authenticated, None otherwise.
    """
    return getattr(request.state, "user", None)


def require_auth(request: Request) -> CognitoUser:
    """Require authentication and return current user.

    Args:
        request: FastAPI request object.

    Returns:
        CognitoUser of authenticated user.

    Raises:
        HTTPException: If user is not authenticated.
    """
    from fastapi import HTTPException

    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
