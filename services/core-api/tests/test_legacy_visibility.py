"""Tests for legacy visibility feature."""

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.legacy import LegacyCreate, LegacyResponse, LegacyUpdate


class TestLegacyVisibilityModel:
    """Tests for Legacy model visibility field."""

    @pytest.mark.asyncio
    async def test_legacy_default_visibility_is_private(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that new legacies default to private visibility."""
        legacy = Legacy(
            name="Test Legacy",
            created_by=test_user.id,
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_can_be_created_as_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that legacies can be created with public visibility."""
        legacy = Legacy(
            name="Public Legacy",
            created_by=test_user.id,
            visibility="public",
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.visibility == "public"


class TestLegacyVisibilitySchemas:
    """Tests for legacy visibility in Pydantic schemas."""

    def test_legacy_create_defaults_to_private(self):
        """Test LegacyCreate defaults visibility to private."""
        data = LegacyCreate(name="Test")
        assert data.visibility == "private"

    def test_legacy_create_accepts_public(self):
        """Test LegacyCreate accepts public visibility."""
        data = LegacyCreate(name="Test", visibility="public")
        assert data.visibility == "public"

    def test_legacy_create_rejects_invalid_visibility(self):
        """Test LegacyCreate rejects invalid visibility values."""
        with pytest.raises(ValidationError):
            LegacyCreate(name="Test", visibility="invalid")

    def test_legacy_update_visibility_optional(self):
        """Test LegacyUpdate has optional visibility field."""
        data = LegacyUpdate()
        assert data.visibility is None

    def test_legacy_response_includes_visibility(self):
        """Test LegacyResponse includes visibility field."""
        from datetime import datetime
        from uuid import uuid4

        response = LegacyResponse(
            id=uuid4(),
            name="Test",
            birth_date=None,
            death_date=None,
            biography=None,
            created_by=uuid4(),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            visibility="public",
        )
        assert response.visibility == "public"


from app.services import legacy as legacy_service


class TestCreateLegacyVisibility:
    """Tests for creating legacies with visibility."""

    @pytest.mark.asyncio
    async def test_create_legacy_default_private(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creating legacy defaults to private."""
        data = LegacyCreate(name="Test Legacy")
        result = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )
        assert result.visibility == "private"

    @pytest.mark.asyncio
    async def test_create_legacy_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creating public legacy."""
        data = LegacyCreate(name="Public Legacy", visibility="public")
        result = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )
        assert result.visibility == "public"


from app.models.legacy import LegacyMember


class TestServiceFunctionsReturnVisibility:
    """Tests that all service functions return visibility."""

    @pytest.mark.asyncio
    async def test_list_user_legacies_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test list_user_legacies includes visibility."""
        # Create a legacy
        legacy = Legacy(name="Test", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.flush()

        member = LegacyMember(legacy_id=legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.list_user_legacies(db=db_session, user_id=test_user.id)
        assert len(result) >= 1
        assert result[0].visibility == "public"

    @pytest.mark.asyncio
    async def test_get_legacy_detail_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test get_legacy_detail includes visibility."""
        legacy = Legacy(name="Test", created_by=test_user.id, visibility="private")
        db_session.add(legacy)
        await db_session.flush()

        member = LegacyMember(legacy_id=legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.get_legacy_detail(
            db=db_session,
            user_id=test_user.id,
            legacy_id=legacy.id,
        )
        assert result.visibility == "private"

    @pytest.mark.asyncio
    async def test_explore_legacies_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore_legacies includes visibility."""
        legacy = Legacy(name="Test", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.commit()

        result = await legacy_service.explore_legacies(db=db_session)
        assert len(result) >= 1
        # Find our legacy
        our_legacy = next((l for l in result if l.name == "Test"), None)
        assert our_legacy is not None
        assert our_legacy.visibility == "public"

    @pytest.mark.asyncio
    async def test_search_legacies_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test search_legacies includes visibility."""
        legacy = Legacy(name="Searchable", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.commit()

        result = await legacy_service.search_legacies_by_name(db=db_session, query="Searchable")
        assert len(result) >= 1
        assert result[0].visibility == "public"


class TestExploreVisibilityFiltering:
    """Tests for explore endpoint visibility filtering."""

    @pytest.mark.asyncio
    async def test_explore_unauthenticated_only_shows_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test unauthenticated explore only returns public legacies."""
        # Create public and private legacies
        public_legacy = Legacy(name="Public One", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Private One", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.commit()

        # Explore without user_id (unauthenticated)
        result = await legacy_service.explore_legacies(db=db_session, user_id=None)

        names = [l.name for l in result]
        assert "Public One" in names
        assert "Private One" not in names

    @pytest.mark.asyncio
    async def test_explore_authenticated_shows_public_and_accessible_private(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ):
        """Test authenticated explore shows public + private legacies user is member of."""
        # Create public legacy by user 2
        public_legacy = Legacy(name="Public By Other", created_by=test_user_2.id, visibility="public")
        db_session.add(public_legacy)

        # Create private legacy user is member of
        private_member = Legacy(name="Private Member", created_by=test_user_2.id, visibility="private")
        db_session.add(private_member)
        await db_session.flush()
        member = LegacyMember(legacy_id=private_member.id, user_id=test_user.id, role="advocate")
        db_session.add(member)

        # Create private legacy user is NOT member of
        private_other = Legacy(name="Private Other", created_by=test_user_2.id, visibility="private")
        db_session.add(private_other)
        await db_session.commit()

        result = await legacy_service.explore_legacies(db=db_session, user_id=test_user.id)

        names = [l.name for l in result]
        assert "Public By Other" in names
        assert "Private Member" in names
        assert "Private Other" not in names

    @pytest.mark.asyncio
    async def test_explore_filter_public_only(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore with visibility_filter='public'."""
        public_legacy = Legacy(name="Filter Public", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Filter Private", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.flush()

        # Add user as member of private legacy
        member = LegacyMember(legacy_id=private_legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.explore_legacies(
            db=db_session,
            user_id=test_user.id,
            visibility_filter="public",
        )

        names = [l.name for l in result]
        assert "Filter Public" in names
        assert "Filter Private" not in names

    @pytest.mark.asyncio
    async def test_explore_filter_private_only(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore with visibility_filter='private'."""
        public_legacy = Legacy(name="Filter Public 2", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Filter Private 2", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.flush()

        member = LegacyMember(legacy_id=private_legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.explore_legacies(
            db=db_session,
            user_id=test_user.id,
            visibility_filter="private",
        )

        names = [l.name for l in result]
        assert "Filter Public 2" not in names
        assert "Filter Private 2" in names
