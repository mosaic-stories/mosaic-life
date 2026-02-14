"""Helpers for session token extraction and hashing."""

import hashlib

from fastapi import Request

from ..config import get_settings


def get_session_cookie_value(request: Request) -> str | None:
    """Get raw session cookie value from request."""
    settings = get_settings()
    return request.cookies.get(settings.session_cookie_name)


def hash_session_token(token: str) -> str:
    """Hash a session token for safe persistence."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_session_token_hash(request: Request) -> str | None:
    """Get hashed session token from request cookie."""
    token = get_session_cookie_value(request)
    if not token:
        return None
    return hash_session_token(token)


def extract_client_ip(request: Request) -> str | None:
    """Extract the best-effort client IP address from request."""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        forwarded_ip = x_forwarded_for.split(",")[0].strip()
        if forwarded_ip:
            return forwarded_ip

    if request.client and request.client.host:
        return request.client.host

    return None


def extract_device_info(request: Request) -> str | None:
    """Extract user-agent string for session display."""
    user_agent = request.headers.get("user-agent")
    if not user_agent:
        return None
    return user_agent[:255]
