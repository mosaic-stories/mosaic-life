"""Username validation and generation utilities."""

from __future__ import annotations

import re
import secrets
import string

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


def generate_username(display_name: str) -> str:
    """Generate a username from a display name with random suffix."""
    # Normalize: lowercase, replace spaces/special chars with hyphens
    base = display_name.lower().strip()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = base.strip("-")

    if not base:
        base = "user"

    # Truncate to leave room for suffix (-xxxx = 5 chars)
    base = base[:24]
    base = base.rstrip("-")

    suffix = "".join(secrets.choice(_SUFFIX_CHARS) for _ in range(4))
    return f"{base}-{suffix}"
