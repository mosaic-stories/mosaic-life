"""Database setup and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


# Module-level cache for session makers
_async_session_maker: async_sessionmaker[AsyncSession] | None = None


# Create sync engine for migrations (Alembic)
def get_sync_engine() -> Engine:
    """Get synchronous SQLAlchemy engine for migrations."""
    settings = get_settings()
    if not settings.db_url:
        raise ValueError("DB_URL not configured")

    # Convert psycopg:// to postgresql:// for sync engine
    db_url = settings.db_url.replace("postgresql+psycopg://", "postgresql://")
    return create_engine(db_url, echo=settings.env == "dev")


# Create async engine for application
def get_async_engine() -> AsyncEngine:
    """Get asynchronous SQLAlchemy engine for application."""
    settings = get_settings()
    if not settings.db_url:
        raise ValueError("DB_URL not configured")

    # Convert to async driver and handle SSL mode
    db_url = settings.db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")

    # asyncpg doesn't support 'sslmode' parameter in URL
    # Remove sslmode from query string - asyncpg will use SSL by default for RDS
    if "?sslmode=require" in db_url:
        db_url = db_url.replace("?sslmode=require", "")
    elif "&sslmode=require" in db_url:
        db_url = db_url.replace("&sslmode=require", "")

    return create_async_engine(db_url, echo=settings.env == "dev")


# Session factories
def get_sync_session_factory() -> sessionmaker[Session]:
    """Get sync session factory for migrations."""
    engine = get_sync_engine()
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get async session factory for application.

    This factory is cached at module level to avoid recreating engines.
    """
    global _async_session_maker
    if _async_session_maker is None:
        engine = get_async_engine()
        _async_session_maker = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _async_session_maker


# Dependency for FastAPI
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency to get database session.

    Usage:
        @router.get("/users")
        async def list_users(db: AsyncSession = Depends(get_db)):
            ...
    """
    async_session = get_async_session_factory()
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_db_for_background() -> AsyncGenerator[AsyncSession, None]:
    """Get database session for background tasks.

    Unlike get_db, this creates a fresh session not tied to a request.
    Use this for background tasks that run after the response is returned.
    """
    async_session = get_async_session_factory()
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
