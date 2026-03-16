"""Username validation and generation utilities."""

from __future__ import annotations

import re
import secrets
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

RESERVED_WORDS: frozenset[str] = frozenset(
    {
        "admin",
        "api",
        "settings",
        "legacy",
        "legacies",
        "help",
        "support",
        "about",
        "auth",
        "login",
        "signup",
        "profile",
        "user",
        "users",
        "story",
        "stories",
        "media",
        "search",
        "explore",
        "notifications",
        "account",
        "privacy",
        "terms",
        "null",
        "undefined",
        "system",
        "connections",
        "favorites",
        "activity",
    }
)

_USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1}$")
_SUFFIX_CHARS = string.ascii_lowercase + string.digits
MAX_USERNAME_ATTEMPTS = 20


def validate_username(username: str) -> str | None:
    """Validate a username. Returns error message or None if valid."""
    if len(username) < 3:
        return "Username must be at least 3 characters"
    if len(username) > 30:
        return "Username must be at most 30 characters"
    if not _USERNAME_PATTERN.match(username):
        return "Username must be lowercase alphanumeric and hyphens, cannot start or end with a hyphen"
    if username in RESERVED_WORDS:
        return "This username is reserved"
    return None


def _slugify_username_base(display_name: str) -> str:
    """Normalize a display name into a username base."""
    base = display_name.lower().strip()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = base.strip("-")

    if not base:
        base = "user"

    # Truncate to leave room for suffix (-xxxx = 5 chars)
    base = base[:24]
    base = base.rstrip("-")
    return base


def generate_username(display_name: str) -> str:
    """Generate a username from a display name with random suffix."""
    base = _slugify_username_base(display_name)

    suffix = "".join(secrets.choice(_SUFFIX_CHARS) for _ in range(4))
    return f"{base}-{suffix}"


async def allocate_username(
    db: AsyncSession, display_name: str, max_attempts: int = MAX_USERNAME_ATTEMPTS
) -> str:
    """Allocate an unused username for a display name."""
    from ..models.user import User

    for _ in range(max_attempts):
        candidate = generate_username(display_name)
        existing = await db.execute(select(User.id).where(User.username == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate

    msg = "Unable to allocate a unique username"
    raise RuntimeError(msg)
