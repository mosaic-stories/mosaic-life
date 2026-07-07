"""Authentication routes supporting Google OAuth and Keycloak OIDC."""

import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings, get_settings
from ..database import get_db
from ..models.profile_settings import ProfileSettings
from ..models.user_session import UserSession
from ..models.user import User
from ..services.username import allocate_username
from .session_tokens import (
    extract_client_ip,
    extract_device_info,
    get_session_cookie_value,
    hash_session_token,
)
from .google import GoogleOAuthError, get_google_client
from .keycloak import KeycloakOIDCError, get_keycloak_client
from .middleware import create_session_cookie, get_current_session, require_auth
from .models import GoogleUser, MeResponse, OIDCUser, SessionData

router = APIRouter()
logger = logging.getLogger(__name__)

# State token validity period (5 minutes)
STATE_TOKEN_MAX_AGE = 300

# PKCE verifier cookie name and lifetime
_PKCE_COOKIE = "mosaic_pkce"


def _is_username_integrity_error(exc: IntegrityError) -> bool:
    message = str(exc.orig).lower() if exc.orig is not None else str(exc).lower()
    return "username" in message


def _is_email_integrity_error(exc: IntegrityError) -> bool:
    message = str(exc.orig).lower() if exc.orig is not None else str(exc).lower()
    return "email" in message


class EmailAlreadyExistsError(Exception):
    """Raised when a new user's email is already registered under a different provider."""

    def __init__(self, email: str) -> None:
        super().__init__(f"Email already registered: {email}")
        self.email = email


def _create_signed_state(secret_key: str) -> str:
    """Create a HMAC-signed state token for CSRF protection."""
    nonce = secrets.token_urlsafe(16)
    timestamp = str(int(time.time()))
    payload = f"{nonce}:{timestamp}"
    signature = hmac.new(
        secret_key.encode(),
        payload.encode(),
        hashlib.sha256,
    ).digest()
    signed = f"{payload}:{base64.urlsafe_b64encode(signature).decode()}"
    return base64.urlsafe_b64encode(signed.encode()).decode()


def _verify_signed_state(state: str, secret_key: str) -> bool:
    """Verify a signed state token; returns True if valid and not expired."""
    try:
        decoded = base64.urlsafe_b64decode(state.encode()).decode()
        parts = decoded.rsplit(":", 2)
        if len(parts) != 3:
            return False
        nonce, timestamp_str, signature_b64 = parts
        payload = f"{nonce}:{timestamp_str}"
        if time.time() - int(timestamp_str) > STATE_TOKEN_MAX_AGE:
            logger.warning(
                "auth.state.expired", extra={"age": time.time() - int(timestamp_str)}
            )
            return False
        expected_signature = hmac.new(
            secret_key.encode(),
            payload.encode(),
            hashlib.sha256,
        ).digest()
        actual_signature = base64.urlsafe_b64decode(signature_b64.encode())
        return hmac.compare_digest(expected_signature, actual_signature)
    except Exception as exc:
        logger.warning("auth.state.invalid", extra={"error": str(exc)})
        return False


def _sign_pkce_value(value: str, secret: str) -> str:
    """HMAC-sign a PKCE verifier so the cookie cannot be forged or tampered with."""
    sig = hmac.new(secret.encode(), value.encode(), hashlib.sha256).digest()
    return f"{value}.{base64.urlsafe_b64encode(sig).decode()}"


def _verify_and_extract_pkce_value(signed: str, secret: str) -> str | None:
    """Verify the signed PKCE cookie and return the raw verifier, or None if invalid."""
    try:
        raw, sig_b64 = signed.rsplit(".", 1)
        expected = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(sig_b64.encode())
        if hmac.compare_digest(expected, actual):
            return raw
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# /me and /providers
# ---------------------------------------------------------------------------


@router.get("/me", response_model=MeResponse)
async def me(request: Request) -> MeResponse:
    """Return current authenticated user from session cookie."""
    session = require_auth(request)
    return MeResponse(
        id=session.user_id,
        email=session.email,
        name=session.name,
        username=session.username,
        avatar_url=session.avatar_url,
    )


@router.get("/auth/providers")
async def list_providers() -> JSONResponse:
    """Return the active auth provider so the frontend can show the right login button."""
    settings = get_settings()
    return JSONResponse({"active": settings.auth_provider})


# ---------------------------------------------------------------------------
# Shared session helpers
# ---------------------------------------------------------------------------


async def _build_and_set_session(
    request: Request,
    db: AsyncSession,
    user: "User",
    settings: Settings,
    response: "RedirectResponse",
) -> None:
    """Populate the session cookie and persist a UserSession record."""
    now = datetime.now(timezone.utc)
    session_data = SessionData(
        user_id=user.id,
        provider=user.provider,
        provider_id=user.provider_id,
        email=user.email,
        name=user.name,
        username=user.username,
        avatar_url=user.avatar_url,
        created_at=now,
        expires_at=now + timedelta(seconds=settings.session_cookie_max_age),
    )
    cookie_name, cookie_value = create_session_cookie(settings, session_data)
    response.set_cookie(
        key=cookie_name,
        value=cookie_value,
        max_age=settings.session_cookie_max_age,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
        domain=settings.session_cookie_domain,
    )
    session_record = UserSession(
        user_id=user.id,
        session_token=hash_session_token(cookie_value),
        device_info=extract_device_info(request),
        ip_address=extract_client_ip(request),
        location=None,
        last_active_at=now,
    )
    db.add(session_record)
    await db.commit()


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------


@router.get("/auth/google")
async def login_google(request: Request) -> RedirectResponse:
    """Initiate Google OAuth login flow."""
    settings = get_settings()

    if settings.auth_provider != "google":
        raise HTTPException(status_code=404, detail="Google auth not active")

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    state = _create_signed_state(settings.session_secret_key)
    redirect_uri = f"{settings.api_url}/api/auth/google/callback"
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    auth_url = f"{settings.google_auth_url}?{urlencode(params)}"
    logger.info("auth.google.login_redirect", extra={"redirect_uri": redirect_uri})
    return RedirectResponse(url=auth_url)


@router.get("/auth/google/callback")
async def callback_google(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Google OAuth callback."""
    settings = get_settings()

    if error:
        logger.error("auth.google.callback_error", extra={"error": error})
        return RedirectResponse(url=f"{settings.app_url}/?error={error}")

    if not state or not _verify_signed_state(state, settings.session_secret_key):
        logger.warning(
            "auth.google.invalid_state", extra={"state": state[:50] if state else None}
        )
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    try:
        google_client = get_google_client(settings)
        redirect_uri = f"{settings.api_url}/api/auth/google/callback"
        token_response = await google_client.exchange_code_for_tokens(
            code=code, redirect_uri=redirect_uri
        )
        user_info = await google_client.get_user_info(token_response["access_token"])
        google_user = GoogleUser(**user_info)

        logger.info(
            "auth.google.user_info_received",
            extra={
                "google_id": google_user.id,
                "email": google_user.email,
                "has_picture": google_user.picture is not None,
            },
        )

        user = await _find_or_create_user(
            db,
            provider="google",
            provider_id=google_user.id,
            email=google_user.email,
            name=google_user.display_name,
            avatar_url=google_user.picture,
            google_id=google_user.id,
        )

        logger.info("auth.google.callback_success", extra={"user_id": str(user.id)})

        response = RedirectResponse(url=f"{settings.app_url}/app")
        await _build_and_set_session(request, db, user, settings, response)
        return response

    except EmailAlreadyExistsError as exc:
        logger.warning("auth.email_already_registered", extra={"email": exc.email})
        return RedirectResponse(
            url=f"{settings.app_url}/?error=email_already_registered"
        )
    except GoogleOAuthError as exc:
        logger.error("auth.google.oauth_error", extra={"error": str(exc)})
        return RedirectResponse(url=f"{settings.app_url}/?error=authentication_failed")
    except Exception as exc:
        logger.error(
            "auth.google.unexpected_error", extra={"error": str(exc)}, exc_info=True
        )
        raise HTTPException(status_code=500, detail="Authentication failed")


# ---------------------------------------------------------------------------
# Keycloak OIDC
# ---------------------------------------------------------------------------


@router.get("/auth/keycloak")
async def login_keycloak(request: Request) -> RedirectResponse:
    """Initiate Keycloak OIDC login flow with PKCE."""
    settings = get_settings()

    if settings.auth_provider != "keycloak":
        raise HTTPException(status_code=404, detail="Keycloak auth not active")

    if not settings.keycloak_client_id or not settings.keycloak_client_secret:
        raise HTTPException(status_code=500, detail="Keycloak OIDC not configured")

    from .keycloak import KeycloakOIDCClient

    try:
        kc = get_keycloak_client(settings)
        auth_endpoint = await kc.get_authorization_endpoint()
    except Exception as exc:
        logger.error(
            "auth.keycloak.metadata_error", extra={"error": str(exc)}, exc_info=True
        )
        raise HTTPException(status_code=502, detail="Cannot reach Keycloak")

    state = _create_signed_state(settings.session_secret_key)
    code_verifier, code_challenge = KeycloakOIDCClient.generate_pkce_pair()

    redirect_uri = f"{settings.api_url}/api/auth/keycloak/callback"
    params = {
        "client_id": settings.keycloak_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    auth_url = f"{auth_endpoint}?{urlencode(params)}"

    logger.info("auth.keycloak.login_redirect", extra={"redirect_uri": redirect_uri})

    response = RedirectResponse(url=auth_url)
    # Store PKCE verifier in a short-lived httpOnly cookie for the callback.
    # domain must match session_cookie_domain so the cookie is sent back when
    # Keycloak redirects to mosaicapi.* even if the login was initiated through
    # the frontend proxy on mosaic.*.
    response.set_cookie(
        key=_PKCE_COOKIE,
        value=_sign_pkce_value(code_verifier, settings.session_secret_key),
        max_age=STATE_TOKEN_MAX_AGE,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api/auth/keycloak/callback",
        domain=settings.session_cookie_domain,
    )
    return response


@router.get("/auth/keycloak/callback")
async def callback_keycloak(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Keycloak OIDC callback — exchange code for tokens and create session."""
    settings = get_settings()

    if error:
        logger.error("auth.keycloak.callback_error", extra={"error": error})
        return RedirectResponse(url=f"{settings.app_url}/?error={error}")

    if not state or not _verify_signed_state(state, settings.session_secret_key):
        logger.warning(
            "auth.keycloak.invalid_state",
            extra={"state": state[:50] if state else None},
        )
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    signed_verifier = request.cookies.get(_PKCE_COOKIE)
    if not signed_verifier:
        raise HTTPException(
            status_code=400, detail="Missing PKCE verifier — login session expired"
        )
    code_verifier = _verify_and_extract_pkce_value(
        signed_verifier, settings.session_secret_key
    )
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Invalid PKCE verifier")

    try:
        kc = get_keycloak_client(settings)
        redirect_uri = f"{settings.api_url}/api/auth/keycloak/callback"

        tokens = await kc.exchange_code_for_tokens(
            code=code,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,
        )
        oidc_user: OIDCUser = await kc.get_user_info(tokens["access_token"])

        logger.info(
            "auth.keycloak.user_info_received",
            extra={"sub": oidc_user.sub, "email": oidc_user.email},
        )

        user = await _find_or_create_user(
            db,
            provider="keycloak",
            provider_id=oidc_user.sub,
            email=oidc_user.email,
            name=oidc_user.display_name,
            avatar_url=oidc_user.picture,
            google_id=None,
        )

        logger.info("auth.keycloak.callback_success", extra={"user_id": str(user.id)})

        response = RedirectResponse(url=f"{settings.app_url}/app")
        await _build_and_set_session(request, db, user, settings, response)

        # Clear the PKCE cookie — it's consumed
        response.delete_cookie(
            key=_PKCE_COOKIE,
            path="/api/auth/keycloak/callback",
            domain=settings.session_cookie_domain,
        )
        return response

    except EmailAlreadyExistsError as exc:
        logger.warning("auth.email_already_registered", extra={"email": exc.email})
        return RedirectResponse(
            url=f"{settings.app_url}/?error=email_already_registered"
        )
    except KeycloakOIDCError as exc:
        logger.error("auth.keycloak.oidc_error", extra={"error": str(exc)})
        return RedirectResponse(url=f"{settings.app_url}/?error=authentication_failed")
    except Exception as exc:
        logger.error(
            "auth.keycloak.unexpected_error", extra={"error": str(exc)}, exc_info=True
        )
        raise HTTPException(status_code=500, detail="Authentication failed")


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@router.post("/auth/logout")
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Log out the current user — clear session cookie and revoke session record."""
    settings = get_settings()

    session = get_current_session(request)
    if session:
        logger.info("auth.logout", extra={"user_id": str(session.user_id)})

    session_cookie = get_session_cookie_value(request)
    if session_cookie and session:
        token_hash = hash_session_token(session_cookie)
        result = await db.execute(
            select(UserSession).where(
                UserSession.user_id == session.user_id,
                UserSession.session_token == token_hash,
                UserSession.revoked_at.is_(None),
            )
        )
        current_session_record = result.scalar_one_or_none()
        if current_session_record:
            current_session_record.revoked_at = datetime.now(timezone.utc)
            await db.commit()

    response = Response(status_code=200)
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        domain=settings.session_cookie_domain,
    )
    return response


# ---------------------------------------------------------------------------
# User upsert (shared by all providers)
# ---------------------------------------------------------------------------


async def _find_or_create_user(
    db: AsyncSession,
    provider: str,
    provider_id: str,
    email: str,
    name: str,
    avatar_url: str | None,
    google_id: str | None,
) -> User:
    """Find an existing user by provider identity or create a new one."""
    result = await db.execute(
        select(User).where(User.provider == provider, User.provider_id == provider_id)
    )
    user = result.scalar_one_or_none()

    if user:
        user.email = email
        user.name = name
        user.avatar_url = avatar_url
        user.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(user)
        logger.info(
            "auth.user_updated", extra={"user_id": str(user.id), "provider": provider}
        )
    else:
        for _ in range(5):
            try:
                user = User(
                    email=email,
                    provider=provider,
                    provider_id=provider_id,
                    google_id=google_id,  # Populated for Google users, None for Keycloak
                    name=name,
                    username=await allocate_username(db, name),
                    avatar_url=avatar_url,
                )
                db.add(user)
                await db.flush()
                db.add(ProfileSettings(user_id=user.id))
                await db.commit()
                await db.refresh(user)
                break
            except IntegrityError as exc:
                await db.rollback()
                if _is_email_integrity_error(exc):
                    raise EmailAlreadyExistsError(email)
                if not _is_username_integrity_error(exc):
                    raise
        else:
            raise RuntimeError("Unable to create user after 5 attempts")

        logger.info(
            "auth.user_created",
            extra={"user_id": str(user.id), "provider": provider, "email": email},
        )

    return user
