"""Tests for proxy-aware request security helpers."""

from starlette.requests import Request

from app.auth.middleware import is_request_secure


def _request(*, scheme: str = "http", forwarded_proto: str | None = None) -> Request:
    headers = []
    if forwarded_proto is not None:
        headers.append((b"x-forwarded-proto", forwarded_proto.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "scheme": scheme,
            "server": ("testserver", 443 if scheme == "https" else 80),
            "headers": headers,
        }
    )


def test_is_request_secure_accepts_normalized_forwarded_https() -> None:
    assert is_request_secure(_request(forwarded_proto="HTTPS")) is True
    assert is_request_secure(_request(forwarded_proto=" https,http ")) is True


def test_is_request_secure_uses_request_scheme_without_forwarded_proto() -> None:
    assert is_request_secure(_request(scheme="https")) is True
    assert is_request_secure(_request(scheme="http")) is False


def test_is_request_secure_rejects_forwarded_http() -> None:
    assert is_request_secure(_request(scheme="https", forwarded_proto="http")) is False
