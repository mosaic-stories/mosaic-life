"""PKCE and signed OAuth cookie helpers."""

import base64
import hashlib
import hmac
import secrets


def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for S256 PKCE."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def sign_value(value: str, secret: str) -> str:
    """HMAC-sign a cookie value so it cannot be forged or tampered with."""
    sig = hmac.new(secret.encode(), value.encode(), hashlib.sha256).digest()
    return f"{value}.{base64.urlsafe_b64encode(sig).decode()}"


def verify_and_extract_value(signed: str, secret: str) -> str | None:
    """Verify a signed cookie value and return the raw value, or None."""
    try:
        raw, sig_b64 = signed.rsplit(".", 1)
        expected = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(sig_b64.encode())
        if hmac.compare_digest(expected, actual):
            return raw
        return None
    except Exception:
        return None
