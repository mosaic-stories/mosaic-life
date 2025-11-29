"""Authentication routes for Google OAuth."""

import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models.user import User
from .google import GoogleOAuthError, get_google_client
from .middleware import create_session_cookie, get_current_session, require_auth
from .models import GoogleUser, MeResponse, SessionData

router = APIRouter()
logger = logging.getLogger(__name__)

# State token validity period (5 minutes)
STATE_TOKEN_MAX_AGE = 300


def _create_signed_state(secret_key: str) -> str:
    """Create a signed state token for CSRF protection.

    The state token contains a random nonce and timestamp, signed with HMAC.
    This allows stateless validation across multiple pods.
    """
    nonce = secrets.token_urlsafe(16)
    timestamp = str(int(time.time()))
    payload = f"{nonce}:{timestamp}"

    # Sign with HMAC-SHA256
    signature = hmac.new(
        secret_key.encode(),
        payload.encode(),
        hashlib.sha256,
    ).digest()

    # Combine payload and signature
    signed = f"{payload}:{base64.urlsafe_b64encode(signature).decode()}"
    return base64.urlsafe_b64encode(signed.encode()).decode()


def _verify_signed_state(state: str, secret_key: str) -> bool:
    """Verify a signed state token.

    Returns True if the token is valid and not expired.
    """
    try:
        # Decode the state
        decoded = base64.urlsafe_b64decode(state.encode()).decode()
        parts = decoded.rsplit(":", 2)
        if len(parts) != 3:
            return False

        nonce, timestamp_str, signature_b64 = parts
        payload = f"{nonce}:{timestamp_str}"

        # Check timestamp (not expired)
        timestamp = int(timestamp_str)
        if time.time() - timestamp > STATE_TOKEN_MAX_AGE:
            logger.warning("auth.state.expired", extra={"age": time.time() - timestamp})
            return False

        # Verify signature
        expected_signature = hmac.new(
            secret_key.encode(),
            payload.encode(),
            hashlib.sha256,
        ).digest()

        actual_signature = base64.urlsafe_b64decode(signature_b64.encode())

        return hmac.compare_digest(expected_signature, actual_signature)
    except Exception as e:
        logger.warning("auth.state.invalid", extra={"error": str(e)})
        return False


@router.get("/me", response_model=MeResponse)
async def me(request: Request) -> MeResponse:
    """Get current authenticated user information.

    Returns user info from validated session cookie.
    """
    session = require_auth(request)

    return MeResponse(
        id=session.user_id,
        email=session.email,
        name=session.name,
        avatar_url=session.avatar_url,
    )


@router.get("/auth/google")
async def login_google(request: Request) -> RedirectResponse:
    """Initiate Google OAuth login flow.

    Redirects user to Google for authentication.
    Implements state parameter for CSRF protection using signed tokens.
    """
    settings = get_settings()

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth not configured",
        )

    # Generate signed state for CSRF protection (stateless across pods)
    state = _create_signed_state(settings.session_secret_key)

    # Build redirect URI (callback endpoint)
    redirect_uri = f"{settings.api_url}/api/auth/google/callback"

    # Build authorization URL
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",  # Request refresh token
        "prompt": "select_account",  # Always show account selector
    }

    auth_url = f"{settings.google_auth_url}?{urlencode(params)}"

    logger.info(
        "auth.google.login_redirect",
        extra={
            "redirect_uri": redirect_uri,
        },
    )

    return RedirectResponse(url=auth_url)


@router.get("/auth/google/callback")
async def callback_google(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Google OAuth callback.

    Exchanges authorization code for tokens, creates or updates user,
    and creates session.
    """
    settings = get_settings()

    # Check for errors from Google
    if error:
        logger.error(
            "auth.google.callback_error",
            extra={"error": error},
        )
        return RedirectResponse(url=f"{settings.app_url}/?error={error}")

    # Validate state (CSRF protection using signed token)
    if not state or not _verify_signed_state(state, settings.session_secret_key):
        logger.warning(
            "auth.google.invalid_state",
            extra={"state": state[:50] if state else None},
        )
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    # Validate authorization code
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Missing authorization code",
        )

    try:
        # Exchange code for tokens
        google_client = get_google_client(settings)
        redirect_uri = f"{settings.api_url}/api/auth/google/callback"

        token_response = await google_client.exchange_code_for_tokens(
            code=code,
            redirect_uri=redirect_uri,
        )

        # Get user info from Google
        user_info = await google_client.get_user_info(token_response["access_token"])
        google_user = GoogleUser(**user_info)

        logger.info(
            "auth.google.user_info_received",
            extra={
                "google_id": google_user.id,
                "email": google_user.email,
            },
        )

        # Find or create user in database
        user = await _find_or_create_user(db, google_user)

        logger.info(
            "auth.google.callback_success",
            extra={
                "user_id": str(user.id),
                "google_id": user.google_id,
                "email": user.email,
            },
        )

        # Create session data
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=user.id,
            google_id=user.google_id,
            email=user.email,
            name=user.name,
            avatar_url=user.avatar_url,
            created_at=now,
            expires_at=now + timedelta(seconds=settings.session_cookie_max_age),
        )

        # Create session cookie
        cookie_name, cookie_value = create_session_cookie(settings, session_data)

        # Redirect to /app (authenticated area) with session cookie
        response = RedirectResponse(url=f"{settings.app_url}/app")
        response.set_cookie(
            key=cookie_name,
            value=cookie_value,
            max_age=settings.session_cookie_max_age,
            httponly=True,
            secure=settings.session_cookie_secure,
            samesite="lax",
            path="/",
        )

        return response

    except GoogleOAuthError as e:
        logger.error(
            "auth.google.oauth_error",
            extra={"error": str(e)},
        )
        return RedirectResponse(url=f"{settings.app_url}/?error=authentication_failed")
    except Exception as e:
        logger.error(
            "auth.google.unexpected_error",
            extra={"error": str(e)},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Authentication failed",
        )


@router.post("/auth/logout")
async def logout(request: Request) -> Response:
    """Log out the current user.

    Clears the session cookie.
    """
    settings = get_settings()

    # Get session if exists (for logging)
    session = get_current_session(request)
    if session:
        logger.info(
            "auth.logout",
            extra={
                "user_id": str(session.user_id),
            },
        )

    # Clear session cookie
    response = Response(status_code=200)
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )

    return response


async def _find_or_create_user(db: AsyncSession, google_user: GoogleUser) -> User:
    """Find existing user or create new one.

    Args:
        db: Database session
        google_user: Google user information

    Returns:
        User model instance
    """
    # Try to find existing user by google_id
    result = await db.execute(select(User).where(User.google_id == google_user.id))
    user = result.scalar_one_or_none()

    if user:
        # Update user info in case it changed
        user.email = google_user.email
        user.name = google_user.display_name
        user.avatar_url = google_user.picture
        user.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(user)

        logger.info(
            "auth.user_updated",
            extra={
                "user_id": str(user.id),
                "google_id": user.google_id,
            },
        )
    else:
        # Create new user
        user = User(
            email=google_user.email,
            google_id=google_user.id,
            name=google_user.display_name,
            avatar_url=google_user.picture,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        logger.info(
            "auth.user_created",
            extra={
                "user_id": str(user.id),
                "google_id": user.google_id,
                "email": user.email,
            },
        )

    return user
