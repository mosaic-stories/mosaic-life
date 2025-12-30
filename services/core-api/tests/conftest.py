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

from app.auth.middleware import create_session_cookie  # noqa: E402
from app.auth.models import SessionData  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.associations import MediaLegacy, StoryLegacy  # noqa: E402
from app.models.legacy import Legacy, LegacyMember  # noqa: E402
from app.models.media import Media  # noqa: E402
from app.models.story import Story  # noqa: E402
from app.models.user import User  # noqa: E402

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
    from unittest.mock import AsyncMock, patch

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Mock both get_db_for_background and index_story_chunks to avoid background task issues in tests
    with (
        patch("app.routes.story.get_db_for_background") as mock_get_db_bg,
        patch("app.routes.story.index_story_chunks", new_callable=AsyncMock),
    ):
        # Make get_db_for_background return the test session
        async def mock_bg_db():
            yield db_session

        mock_get_db_bg.return_value = mock_bg_db()

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


def create_auth_headers_for_user(user: User) -> dict[str, str]:
    """Create authentication headers for a specific user."""
    settings = get_settings()

    now = datetime.now(timezone.utc)
    session_data = SessionData(
        user_id=user.id,
        google_id=user.google_id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        created_at=now,
        expires_at=now + timedelta(hours=24),
    )

    cookie_name, cookie_value = create_session_cookie(settings, session_data)
    return {"Cookie": f"{cookie_name}={cookie_value}"}


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """Create authentication headers for test user."""
    return create_auth_headers_for_user(test_user)


@pytest_asyncio.fixture
async def test_legacy(db_session: AsyncSession, test_user: User) -> Legacy:
    """Create a test legacy with creator membership.

    Note: Created as public for backwards compatibility with tests
    that don't pass user_id to search functions.
    """
    legacy = Legacy(
        name="Test Legacy",
        birth_date=None,
        death_date=None,
        biography="Test biography",
        created_by=test_user.id,
        visibility="public",
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
async def test_legacy_2(db_session: AsyncSession, test_user: User) -> Legacy:
    """Create a second test legacy for multi-legacy scenarios."""
    legacy = Legacy(
        name="Second Legacy",
        created_by=test_user.id,
        visibility="private",
    )
    db_session.add(legacy)
    await db_session.flush()

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
async def test_story(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a test story with private visibility."""
    story = Story(
        author_id=test_user.id,
        title="Test Story",
        content="This is test story content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.flush()

    # Create association with legacy
    story_legacy = StoryLegacy(
        story_id=story.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(story_legacy)
    await db_session.commit()
    await db_session.refresh(story)
    return story


@pytest_asyncio.fixture
async def test_story_public(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a test story with public visibility."""
    story = Story(
        author_id=test_user.id,
        title="Public Test Story",
        content="This is a public test story content in markdown.",
        visibility="public",
    )
    db_session.add(story)
    await db_session.flush()

    # Create association with legacy
    story_legacy = StoryLegacy(
        story_id=story.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(story_legacy)
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
        author_id=test_user.id,
        title="Private Test Story",
        content="This is a private test story content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.flush()

    # Create association with legacy
    story_legacy = StoryLegacy(
        story_id=story.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(story_legacy)
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
        author_id=test_user.id,
        title="Personal Test Story",
        content="This is a personal test story content.",
        visibility="personal",
    )
    db_session.add(story)
    await db_session.flush()

    # Create association with legacy
    story_legacy = StoryLegacy(
        story_id=story.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(story_legacy)
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
        owner_id=test_user.id,
        filename="test-image.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        storage_path=f"user/{test_user.id}/test-media-id.jpg",
    )
    db_session.add(media)
    await db_session.flush()

    # Create association with legacy
    media_legacy = MediaLegacy(
        media_id=media.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(media_legacy)
    await db_session.commit()
    await db_session.refresh(media)
    return media
