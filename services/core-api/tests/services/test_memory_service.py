"""Tests for memory service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.memory import LegacyFact
from app.models.user import User
from app.services import memory as memory_service


class TestGetFactsForContext:
    """Tests for get_facts_for_context."""

    @pytest.mark.asyncio
    async def test_returns_users_private_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that user sees their own private facts."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved fishing",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        facts = await memory_service.get_facts_for_context(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 1
        assert facts[0].content == "Loved fishing"

    @pytest.mark.asyncio
    async def test_returns_shared_facts_from_other_users(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that user sees shared facts from others."""
        # User 2's shared fact
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            category="personality",
            content="Very generous person",
            visibility="shared",
        )
        db_session.add(fact)
        await db_session.commit()

        # User 1 should see it
        facts = await memory_service.get_facts_for_context(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 1
        assert facts[0].content == "Very generous person"

    @pytest.mark.asyncio
    async def test_does_not_return_other_users_private_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that user cannot see others' private facts."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            category="personality",
            content="Secret trait",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        facts = await memory_service.get_facts_for_context(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 0


class TestListUserFacts:
    """Tests for list_user_facts."""

    @pytest.mark.asyncio
    async def test_returns_users_own_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test listing user's own facts for a legacy."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved painting",
        )
        db_session.add(fact)
        await db_session.commit()

        facts = await memory_service.list_user_facts(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 1
        assert facts[0].content == "Loved painting"


class TestDeleteFact:
    """Tests for delete_fact."""

    @pytest.mark.asyncio
    async def test_owner_can_delete_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that fact owner can delete their fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="To be deleted",
        )
        db_session.add(fact)
        await db_session.commit()

        await memory_service.delete_fact(
            db=db_session,
            fact_id=fact.id,
            user_id=test_user.id,
        )

        remaining = await memory_service.list_user_facts(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_non_owner_cannot_delete_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that non-owner cannot delete someone else's fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Not yours to delete",
        )
        db_session.add(fact)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await memory_service.delete_fact(
                db=db_session,
                fact_id=fact.id,
                user_id=test_user_2.id,
            )
        assert exc.value.status_code == 404


class TestUpdateFactVisibility:
    """Tests for update_fact_visibility."""

    @pytest.mark.asyncio
    async def test_owner_can_share_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that owner can change visibility to shared."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Shareable fact",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        updated = await memory_service.update_fact_visibility(
            db=db_session,
            fact_id=fact.id,
            user_id=test_user.id,
            visibility="shared",
        )

        assert updated.visibility == "shared"

    @pytest.mark.asyncio
    async def test_owner_can_unshare_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that owner can change visibility back to private."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Was shared",
            visibility="shared",
        )
        db_session.add(fact)
        await db_session.commit()

        updated = await memory_service.update_fact_visibility(
            db=db_session,
            fact_id=fact.id,
            user_id=test_user.id,
            visibility="private",
        )

        assert updated.visibility == "private"

    @pytest.mark.asyncio
    async def test_non_owner_cannot_change_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that non-owner cannot change visibility."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Not yours",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await memory_service.update_fact_visibility(
                db=db_session,
                fact_id=fact.id,
                user_id=test_user_2.id,
                visibility="shared",
            )
        assert exc.value.status_code == 404
