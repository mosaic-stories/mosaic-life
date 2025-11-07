"""Database setup and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


# Create sync engine for migrations (Alembic)
def get_sync_engine():
    """Get synchronous SQLAlchemy engine for migrations."""
    settings = get_settings()
    if not settings.db_url:
        raise ValueError("DB_URL not configured")

    # Convert psycopg:// to postgresql:// for sync engine
    db_url = settings.db_url.replace("postgresql+psycopg://", "postgresql://")
    return create_engine(db_url, echo=settings.env == "dev")


# Create async engine for application
def get_async_engine():
    """Get asynchronous SQLAlchemy engine for application."""
    settings = get_settings()
    if not settings.db_url:
        raise ValueError("DB_URL not configured")

    # Convert to async driver
    db_url = settings.db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")
    return create_async_engine(db_url, echo=settings.env == "dev")


# Session factories
def get_sync_session_factory() -> sessionmaker:
    """Get sync session factory for migrations."""
    engine = get_sync_engine()
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_async_session_factory() -> async_sessionmaker:
    """Get async session factory for application."""
    engine = get_async_engine()
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )


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
