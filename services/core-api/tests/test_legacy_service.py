"""Unit tests for legacy service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from app.schemas.legacy import LegacyCreate, LegacyUpdate
from app.services import legacy as legacy_service


class TestCheckLegacyAccess:
    """Tests for check_legacy_access function."""

    @pytest.mark.asyncio
    async def test_check_access_member_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful access check for member."""
        member = await legacy_service.check_legacy_access(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            required_role="member",
        )
        assert member is not None
        assert member.role == "creator"  # Creator has >= member permissions

    @pytest.mark.asyncio
    async def test_check_access_not_member(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test access denied when user is not a member."""
        with pytest.raises(HTTPException) as exc:
            await legacy_service.check_legacy_access(
                db=db_session,
                user_id=test_user_2.id,
                legacy_id=test_legacy.id,
            )
        assert exc.value.status_code == 403
        assert "Not a member" in exc.value.detail

    @pytest.mark.asyncio
    async def test_check_access_pending_member(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test access denied when membership is pending."""
        with pytest.raises(HTTPException) as exc:
            await legacy_service.check_legacy_access(
                db=db_session,
                user_id=test_user_2.id,
                legacy_id=test_legacy_with_pending.id,
            )
        assert exc.value.status_code == 403
        assert "pending" in exc.value.detail.lower()

    @pytest.mark.asyncio
    async def test_check_access_insufficient_role(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test access denied when role is insufficient."""
        # First, remove existing creator role and update to member
        from sqlalchemy import select

        result = await db_session.execute(
            select(LegacyMember).filter(
                LegacyMember.legacy_id == test_legacy.id,
                LegacyMember.user_id == test_user.id,
            )
        )
        existing = result.scalar_one()
        existing.role = "member"
        await db_session.commit()

        # Now test that member cannot do creator actions
        with pytest.raises(HTTPException) as exc:
            await legacy_service.check_legacy_access(
                db=db_session,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
                required_role="creator",
            )
        assert exc.value.status_code == 403


class TestCreateLegacy:
    """Tests for create_legacy function."""

    @pytest.mark.asyncio
    async def test_create_legacy_success(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test successful legacy creation."""
        data = LegacyCreate(
            name="New Legacy",
            biography="Test biography",
        )

        legacy = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        assert legacy.name == "New Legacy"
        assert legacy.biography == "Test biography"
        assert legacy.created_by == test_user.id
        assert legacy.creator_email == test_user.email

    @pytest.mark.asyncio
    async def test_create_legacy_creates_creator_membership(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that creating legacy automatically adds creator membership."""
        data = LegacyCreate(name="New Legacy")

        legacy = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        # Verify creator membership exists
        from sqlalchemy import select

        result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == legacy.id,
                LegacyMember.user_id == test_user.id,
            )
        )
        member = result.scalar_one()
        assert member.role == "creator"


class TestListUserLegacies:
    """Tests for list_user_legacies function."""

    @pytest.mark.asyncio
    async def test_list_user_legacies(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_media,
    ):
        """Test listing user's legacies."""
        # Attach media as profile image to exercise response fields
        test_legacy.profile_image_id = test_media.id
        test_legacy.profile_image = test_media
        await db_session.commit()

        legacies = await legacy_service.list_user_legacies(
            db=db_session,
            user_id=test_user.id,
        )

        assert len(legacies) == 1
        assert legacies[0].id == test_legacy.id
        assert legacies[0].name == test_legacy.name
        assert legacies[0].profile_image_id == test_media.id
        assert legacies[0].profile_image_url

    @pytest.mark.asyncio
    async def test_list_excludes_pending(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test that pending memberships are excluded."""
        legacies = await legacy_service.list_user_legacies(
            db=db_session,
            user_id=test_user_2.id,
        )

        assert len(legacies) == 0  # Pending member shouldn't see legacy


class TestSearchLegaciesByName:
    """Tests for search_legacies_by_name function."""

    @pytest.mark.asyncio
    async def test_search_case_insensitive(
        self,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ):
        """Test case-insensitive search."""
        results = await legacy_service.search_legacies_by_name(
            db=db_session,
            query="test",
        )

        assert len(results) >= 1
        assert any(r.id == test_legacy.id for r in results)

    @pytest.mark.asyncio
    async def test_search_partial_match(
        self,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ):
        """Test partial match search."""
        results = await legacy_service.search_legacies_by_name(
            db=db_session,
            query="Leg",
        )

        assert len(results) >= 1
        assert any(r.id == test_legacy.id for r in results)


class TestGetLegacyDetail:
    """Tests for get_legacy_detail function."""

    @pytest.mark.asyncio
    async def test_get_legacy_detail_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test getting legacy details as member."""
        legacy = await legacy_service.get_legacy_detail(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        assert legacy.id == test_legacy.id
        assert legacy.name == test_legacy.name
        assert legacy.members is not None
        assert len(legacy.members) >= 1

    @pytest.mark.asyncio
    async def test_get_legacy_detail_not_member(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test getting legacy details when not a member."""
        with pytest.raises(HTTPException) as exc:
            await legacy_service.get_legacy_detail(
                db=db_session,
                user_id=test_user_2.id,
                legacy_id=test_legacy.id,
            )
        assert exc.value.status_code == 403


class TestRequestJoinLegacy:
    """Tests for request_join_legacy function."""

    @pytest.mark.asyncio
    async def test_request_join_success(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test successful join request."""
        result = await legacy_service.request_join_legacy(
            db=db_session,
            user_id=test_user_2.id,
            legacy_id=test_legacy.id,
        )

        assert result["message"] == "Join request submitted"

        # Verify pending membership created
        from sqlalchemy import select

        member_result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == test_legacy.id,
                LegacyMember.user_id == test_user_2.id,
            )
        )
        member = member_result.scalar_one()
        assert member.role == "pending"

    @pytest.mark.asyncio
    async def test_request_join_already_member(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test join request when already a member."""
        with pytest.raises(HTTPException) as exc:
            await legacy_service.request_join_legacy(
                db=db_session,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )
        assert exc.value.status_code == 400
        assert "Already a member" in exc.value.detail


class TestApproveLegacyMember:
    """Tests for approve_legacy_member function."""

    @pytest.mark.asyncio
    async def test_approve_member_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test successful member approval."""
        result = await legacy_service.approve_legacy_member(
            db=db_session,
            approver_user_id=test_user.id,
            legacy_id=test_legacy_with_pending.id,
            user_id=test_user_2.id,
        )

        assert result["message"] == "Member approved"

        # Verify role changed to member
        from sqlalchemy import select

        member_result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == test_legacy_with_pending.id,
                LegacyMember.user_id == test_user_2.id,
            )
        )
        member = member_result.scalar_one()
        assert member.role == "member"

    @pytest.mark.asyncio
    async def test_approve_member_not_creator(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test approval fails when approver is not creator."""
        with pytest.raises(HTTPException) as exc:
            await legacy_service.approve_legacy_member(
                db=db_session,
                approver_user_id=test_user_2.id,
                legacy_id=test_legacy_with_pending.id,
                user_id=test_user_2.id,
            )
        assert exc.value.status_code == 403


class TestUpdateLegacy:
    """Tests for update_legacy function."""

    @pytest.mark.asyncio
    async def test_update_legacy_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful legacy update."""
        data = LegacyUpdate(
            name="Updated Name",
            biography="Updated biography",
        )

        legacy = await legacy_service.update_legacy(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            data=data,
        )

        assert legacy.name == "Updated Name"
        assert legacy.biography == "Updated biography"


class TestDeleteLegacy:
    """Tests for delete_legacy function."""

    @pytest.mark.asyncio
    async def test_delete_legacy_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful legacy deletion."""
        result = await legacy_service.delete_legacy(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        assert result["message"] == "Legacy deleted"

        # Verify legacy deleted
        from sqlalchemy import select

        legacy_result = await db_session.execute(
            select(Legacy).where(Legacy.id == test_legacy.id)
        )
        deleted_legacy = legacy_result.scalar_one_or_none()
        assert deleted_legacy is None


class TestRemoveLegacyMember:
    """Tests for remove_legacy_member function."""

    @pytest.mark.asyncio
    async def test_remove_member_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test successful member removal."""
        result = await legacy_service.remove_legacy_member(
            db=db_session,
            remover_user_id=test_user.id,
            legacy_id=test_legacy_with_pending.id,
            user_id=test_user_2.id,
        )

        assert result["message"] == "Member removed"

    @pytest.mark.asyncio
    async def test_cannot_remove_creator(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that creator cannot be removed."""
        with pytest.raises(HTTPException) as exc:
            await legacy_service.remove_legacy_member(
                db=db_session,
                remover_user_id=test_user.id,
                legacy_id=test_legacy.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 400
        assert "Cannot remove" in exc.value.detail


class TestRoleHierarchy:
    """Tests for role hierarchy."""

    def test_role_levels(self):
        """Test role level values."""
        from app.services.legacy import ROLE_LEVELS

        assert ROLE_LEVELS["creator"] == 4
        assert ROLE_LEVELS["admin"] == 3
        assert ROLE_LEVELS["advocate"] == 2
        assert ROLE_LEVELS["admirer"] == 1

    def test_can_manage_role(self):
        """Test role management permissions."""
        from app.services.legacy import can_manage_role

        # Creator can manage all roles
        assert can_manage_role("creator", "creator") is True
        assert can_manage_role("creator", "admin") is True
        assert can_manage_role("creator", "advocate") is True
        assert can_manage_role("creator", "admirer") is True

        # Admin can manage admin and below
        assert can_manage_role("admin", "creator") is False
        assert can_manage_role("admin", "admin") is True
        assert can_manage_role("admin", "advocate") is True
        assert can_manage_role("admin", "admirer") is True

        # Advocate can manage advocate and below
        assert can_manage_role("advocate", "creator") is False
        assert can_manage_role("advocate", "admin") is False
        assert can_manage_role("advocate", "advocate") is True
        assert can_manage_role("advocate", "admirer") is True

        # Admirer cannot manage anyone
        assert can_manage_role("admirer", "creator") is False
        assert can_manage_role("admirer", "admin") is False
        assert can_manage_role("admirer", "advocate") is False
        assert can_manage_role("admirer", "admirer") is False

    def test_can_invite_role(self):
        """Test role invitation permissions."""
        from app.services.legacy import can_invite_role

        # Same as can_manage_role
        assert can_invite_role("creator", "admin") is True
        assert can_invite_role("admin", "creator") is False
        assert can_invite_role("advocate", "admirer") is True
        assert can_invite_role("admirer", "admirer") is False
