"""Shared test fixtures and configuration."""

import asyncio
import os
import tempfile
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set up test environment BEFORE importing app modules that use get_settings
_test_media_dir = tempfile.mkdtemp(prefix="mosaic_test_media_")
os.environ["LOCAL_MEDIA_PATH"] = _test_media_dir
os.environ["STORAGE_BACKEND"] = "local"

from app.auth.middleware import create_session_cookie
from app.auth.models import SessionData
from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.models.legacy import Legacy, LegacyMember
from app.models.media import Media
from app.models.story import Story
from app.models.user import User

# Clear the lru_cache on get_settings to pick up test env vars
get_settings.cache_clear()


# Test database URL (in-memory SQLite for speed)
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Set up test environment cleanup after all tests run."""
    yield

    # Cleanup after all tests
    import shutil
    shutil.rmtree(_test_media_dir, ignore_errors=True)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DB_URL,
        echo=False,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Drop all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with database override."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        google_id="google_test_123",
        name="Test User",
        avatar_url="https://example.com/avatar.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_user_2(db_session: AsyncSession) -> User:
    """Create a second test user."""
    user = User(
        email="test2@example.com",
        google_id="google_test_456",
        name="Test User 2",
        avatar_url="https://example.com/avatar2.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """Create authentication headers for test user."""
    settings = get_settings()

    now = datetime.now(timezone.utc)
    session_data = SessionData(
        user_id=test_user.id,
        google_id=test_user.google_id,
        email=test_user.email,
        name=test_user.name,
        avatar_url=test_user.avatar_url,
        created_at=now,
        expires_at=now + timedelta(hours=24),
    )

    cookie_name, cookie_value = create_session_cookie(settings, session_data)
    return {"Cookie": f"{cookie_name}={cookie_value}"}


@pytest_asyncio.fixture
async def test_legacy(db_session: AsyncSession, test_user: User) -> Legacy:
    """Create a test legacy with creator membership."""
    legacy = Legacy(
        name="Test Legacy",
        birth_date=None,
        death_date=None,
        biography="Test biography",
        created_by=test_user.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    # Add creator as member
    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=test_user.id,
        role="creator",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def test_legacy_with_pending(
    db_session: AsyncSession,
    test_user: User,
    test_user_2: User,
) -> Legacy:
    """Create a test legacy with a pending join request."""
    legacy = Legacy(
        name="Legacy with Pending",
        birth_date=None,
        death_date=None,
        biography="Test biography",
        created_by=test_user.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    # Add creator as member
    creator_member = LegacyMember(
        legacy_id=legacy.id,
        user_id=test_user.id,
        role="creator",
    )
    db_session.add(creator_member)

    # Add pending member
    pending_member = LegacyMember(
        legacy_id=legacy.id,
        user_id=test_user_2.id,
        role="pending",
    )
    db_session.add(pending_member)

    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def test_story_public(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a test story with public visibility."""
    story = Story(
        legacy_id=test_legacy.id,
        author_id=test_user.id,
        title="Public Test Story",
        content="This is a public test story content in markdown.",
        visibility="public",
    )
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)
    return story


@pytest_asyncio.fixture
async def test_story_private(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a test story with private visibility."""
    story = Story(
        legacy_id=test_legacy.id,
        author_id=test_user.id,
        title="Private Test Story",
        content="This is a private test story content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)
    return story


@pytest_asyncio.fixture
async def test_story_personal(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a test story with personal visibility."""
    story = Story(
        legacy_id=test_legacy.id,
        author_id=test_user.id,
        title="Personal Test Story",
        content="This is a personal test story content.",
        visibility="personal",
    )
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)
    return story


@pytest_asyncio.fixture
async def test_media(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Media:
    """Create a test media item."""
    media = Media(
        legacy_id=test_legacy.id,
        filename="test-image.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        storage_path=f"legacy/{test_legacy.id}/test-media-id.jpg",
        uploaded_by=test_user.id,
    )
    db_session.add(media)
    await db_session.commit()
    await db_session.refresh(media)
    return media
