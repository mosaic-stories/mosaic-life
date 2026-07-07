"""Session middleware for Google OAuth authentication."""

import json
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from ..config import Settings, get_settings
from ..database import get_db
from ..models.user_session import UserSession
from .models import SessionData
from .session_tokens import hash_session_token

logger = logging.getLogger(__name__)


class SessionMiddleware(BaseHTTPMiddleware):
    """Middleware to handle session cookie validation.

    This middleware:
    1. Checks for session cookie on requests
    2. Validates and decrypts the session cookie
    3. Extracts session data (user_id, email, name, etc.)
    4. Attaches session data to request state
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

        # Get session cookie
        session_cookie = request.cookies.get(self.settings.session_cookie_name)

        if session_cookie:
            try:
                # Validate and extract session data from cookie
                session_data = self._validate_session_cookie(session_cookie)

                if await self._is_session_revoked(
                    request, session_cookie, session_data.user_id
                ):
                    logger.warning(
                        "session.revoked",
                        extra={
                            "user_id": str(session_data.user_id),
                            "path": request.url.path,
                        },
                    )
                    request.state.authenticated = False
                else:
                    # Attach session to request state
                    request.state.session = session_data
                    request.state.authenticated = True

                    logger.debug(
                        "session.validated",
                        extra={
                            "user_id": str(session_data.user_id),
                            "path": request.url.path,
                        },
                    )

            except (SignatureExpired, BadSignature) as e:
                logger.warning(
                    "session.invalid_cookie",
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

    def _validate_session_cookie(self, cookie_value: str) -> SessionData:
        """Validate and extract session data from session cookie.

        Args:
            cookie_value: The encrypted session cookie value.

        Returns:
            SessionData object.

        Raises:
            SignatureExpired: If the cookie has expired.
            BadSignature: If the cookie signature is invalid.
        """
        # Unsign the cookie with max age validation
        unsigned_value = self.signer.unsign(
            cookie_value,
            max_age=self.settings.session_cookie_max_age,
        )

        # Parse JSON session data
        session_dict = json.loads(unsigned_value.decode("utf-8"))
        return SessionData(**session_dict)

    async def _is_session_revoked(
        self, request: Request, cookie_value: str, user_id: UUID
    ) -> bool:
        """Check the UserSession table for explicit revocation.

        A cookie with no matching row (e.g. one predating session tracking)
        is treated as not revoked — every login now creates one, so this
        only affects pre-existing sessions.
        """
        # Resolve via dependency_overrides rather than calling get_db()
        # outright, so this respects the same test override used everywhere
        # else in the app.
        token_hash = hash_session_token(cookie_value)
        get_db_dependency = request.app.dependency_overrides.get(get_db, get_db)
        db_gen = get_db_dependency()
        try:
            db = await anext(db_gen)
            result = await db.execute(
                select(UserSession).where(
                    UserSession.session_token == token_hash,
                    UserSession.user_id == user_id,
                )
            )
            session_row = result.scalar_one_or_none()
            if session_row is None:
                return False
            if session_row.revoked_at is not None:
                return True
            now = datetime.now(timezone.utc)
            last_active_at = session_row.last_active_at
            if last_active_at.tzinfo is None:
                # SQLite hands back naive datetimes even for
                # DateTime(timezone=True) columns; every write path stores
                # UTC, so treat a naive read as UTC too.
                last_active_at = last_active_at.replace(tzinfo=timezone.utc)
            if (now - last_active_at).total_seconds() >= 60:
                session_row.last_active_at = now
                await db.commit()
            return False
        finally:
            await db_gen.aclose()

    def _is_public_path(self, path: str) -> bool:
        """Check if the path is a public endpoint that doesn't require auth."""
        public_paths = [
            "/healthz",
            "/readyz",
            "/metrics",
            "/api/auth/google",
            "/api/auth/google/callback",
            "/api/auth/keycloak",
            "/api/auth/keycloak/callback",
            "/api/auth/providers",
            "/docs",
            "/openapi.json",
        ]
        # Check exact match for root path
        if path == "/" or path == "":
            return True
        return any(path.startswith(p) for p in public_paths)


def create_session_cookie(
    settings: Settings,
    session_data: SessionData,
) -> tuple[str, str]:
    """Create a signed session cookie.

    Args:
        settings: Application settings.
        session_data: Session data to store in the cookie.

    Returns:
        Tuple of (cookie_name, cookie_value).
    """
    signer = TimestampSigner(settings.session_secret_key)

    # Serialize session data to JSON
    session_json = session_data.model_dump_json()

    # Sign the JSON string
    signed_session = signer.sign(session_json.encode("utf-8")).decode("utf-8")

    return settings.session_cookie_name, signed_session


def get_current_session(request: Request) -> SessionData | None:
    """Get the current session from request state.

    Args:
        request: FastAPI request object.

    Returns:
        SessionData if authenticated, None otherwise.
    """
    return getattr(request.state, "session", None)


def require_auth(request: Request) -> SessionData:
    """Require authentication and return current session.

    Args:
        request: FastAPI request object.

    Returns:
        SessionData of authenticated user.

    Raises:
        HTTPException: If user is not authenticated.
    """
    from fastapi import HTTPException

    session = get_current_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session
