"""Tests for database URL normalization."""

import pytest

from app.database import normalize_async_db_url


def test_normalize_async_db_url_converts_psycopg_and_strips_sslmode() -> None:
    """Async URLs should use asyncpg and omit sslmode for asyncpg compatibility."""
    db_url = "postgresql+psycopg://user:pass@localhost:5432/core?sslmode=require"

    normalized = normalize_async_db_url(db_url)

    assert normalized == "postgresql+asyncpg://user:pass@localhost:5432/core"


def test_normalize_async_db_url_converts_plain_postgres_scheme() -> None:
    """Plain PostgreSQL URLs should be rewritten to asyncpg URLs."""
    db_url = "postgresql://user:pass@localhost:5432/core"

    normalized = normalize_async_db_url(db_url)

    assert normalized == "postgresql+asyncpg://user:pass@localhost:5432/core"


def test_normalize_async_db_url_rejects_unsupported_scheme() -> None:
    """Unsupported database URLs should raise a ValueError."""
    with pytest.raises(ValueError, match="Unsupported DB_URL format"):
        normalize_async_db_url("sqlite+aiosqlite:///:memory:")
