import logging
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, Response

from ..config import get_settings
from .cognito import CognitoError, get_cognito_client
from .middleware import create_session_cookie, get_current_user
from .models import MeResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# Store for PKCE state validation (in production, use Redis or similar)
_state_store: dict[str, str] = {}


@router.get("/me", response_model=MeResponse)
async def me(request: Request) -> MeResponse:
    """Get current authenticated user information.

    Returns user info from validated JWT token in session cookie.
    Falls back to dev stub if Cognito auth is disabled.
    """
    settings = get_settings()

    if not settings.enable_cognito_auth:
        # MVP stub: in dev, treat presence of a cookie as authenticated
        user_id = request.cookies.get("session_user_id", "dev-user")
        email = request.cookies.get("session_email", "dev@example.com")
        name = request.cookies.get("session_name", "Dev User")
        return MeResponse(id=user_id, email=email, name=name)

    # Get authenticated user from session middleware
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return MeResponse(
        id=user.sub,
        email=user.email,
        name=user.display_name,
        email_verified=user.email_verified,
        given_name=user.given_name,
        family_name=user.family_name,
    )


@router.get("/auth/login")
async def login(request: Request) -> RedirectResponse:
    """Initiate OIDC login flow.

    Redirects user to Cognito Hosted UI for authentication.
    Implements PKCE (Proof Key for Code Exchange) for security.
    """
    settings = get_settings()

    if not settings.enable_cognito_auth:
        raise HTTPException(
            status_code=501,
            detail="Cognito authentication is not enabled",
        )

    if not settings.oidc_authorization_endpoint:
        raise HTTPException(
            status_code=500,
            detail="OIDC authorization endpoint not configured",
        )

    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)
    _state_store[state] = "pending"

    # Build redirect URI (callback endpoint)
    redirect_uri = f"{settings.api_url}/api/auth/callback"

    # Build authorization URL
    params = {
        "client_id": settings.cognito_client_id,
        "response_type": "code",
        "scope": "email openid profile",
        "redirect_uri": redirect_uri,
        "state": state,
    }

    auth_url = f"{settings.oidc_authorization_endpoint}?{urlencode(params)}"

    logger.info(
        "auth.login.redirect",
        extra={
            "redirect_uri": redirect_uri,
            "state": state,
        },
    )

    return RedirectResponse(url=auth_url)


@router.get("/auth/callback")
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Handle OIDC callback from Cognito.

    Exchanges authorization code for tokens and creates session.
    """
    settings = get_settings()

    if not settings.enable_cognito_auth:
        raise HTTPException(
            status_code=501,
            detail="Cognito authentication is not enabled",
        )

    # Check for errors from Cognito
    if error:
        logger.error(
            "auth.callback.error",
            extra={"error": error},
        )
        return RedirectResponse(url=f"{settings.app_url}/login?error={error}")

    # Validate state (CSRF protection)
    if not state or state not in _state_store:
        logger.warning(
            "auth.callback.invalid_state",
            extra={"state": state},
        )
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    # Remove state from store (one-time use)
    del _state_store[state]

    # Validate authorization code
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Missing authorization code",
        )

    try:
        # Exchange code for tokens
        cognito_client = get_cognito_client(settings)
        redirect_uri = f"{settings.api_url}/api/auth/callback"

        token_response = await cognito_client.exchange_code_for_tokens(
            code=code,
            redirect_uri=redirect_uri,
        )

        # Verify the ID token
        user = await cognito_client.verify_token(token_response.id_token)

        logger.info(
            "auth.callback.success",
            extra={
                "user_id": user.sub,
                "email": user.email,
            },
        )

        # Create session cookie
        cookie_name, cookie_value = create_session_cookie(
            settings,
            token_response.id_token,
        )

        # Redirect to app with session cookie
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

    except CognitoError as e:
        logger.error(
            "auth.callback.cognito_error",
            extra={"error": str(e)},
        )
        return RedirectResponse(
            url=f"{settings.app_url}/login?error=authentication_failed"
        )
    except Exception as e:
        logger.error(
            "auth.callback.unexpected_error",
            extra={"error": str(e)},
        )
        raise HTTPException(
            status_code=500,
            detail="Authentication failed",
        )


@router.post("/auth/logout")
async def logout(request: Request) -> Response:
    """Log out the current user.

    Clears the session cookie and optionally redirects to Cognito logout.
    """
    settings = get_settings()

    if not settings.enable_cognito_auth:
        # Dev mode: just return success
        response = Response(status_code=200)
        response.delete_cookie(
            key=settings.session_cookie_name,
            path="/",
        )
        return response

    # Clear session cookie
    response = Response(status_code=200)
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )

    logger.info(
        "auth.logout",
        extra={
            "user_id": getattr(get_current_user(request), "sub", "unknown"),
        },
    )

    return response


@router.get("/auth/logout-redirect")
async def logout_redirect(request: Request) -> RedirectResponse:
    """Alternative logout endpoint that redirects through Cognito.

    This ensures the Cognito session is also terminated.
    """
    settings = get_settings()

    if not settings.enable_cognito_auth or not settings.oidc_logout_endpoint:
        return RedirectResponse(url=settings.app_url)

    # Build Cognito logout URL
    logout_params = {
        "client_id": settings.cognito_client_id,
        "logout_uri": settings.app_url,
    }

    cognito_logout_url = f"{settings.oidc_logout_endpoint}?{urlencode(logout_params)}"

    # Clear session cookie before redirect
    response = RedirectResponse(url=cognito_logout_url)
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )

    logger.info(
        "auth.logout_redirect",
        extra={
            "user_id": getattr(get_current_user(request), "sub", "unknown"),
        },
    )

    return response
