"""Tests for Person matching service."""

import pytest
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person
from app.services.person import find_match_candidates


@pytest.mark.asyncio
class TestFindMatchCandidates:
    async def test_exact_name_match(self, db_session: AsyncSession):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        candidates = await find_match_candidates(db=db_session, name="John Smith")
        assert len(candidates) >= 1
        assert candidates[0].canonical_name == "John Smith"
        assert candidates[0].confidence > 0.0

    async def test_no_match(self, db_session: AsyncSession):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        candidates = await find_match_candidates(
            db=db_session, name="Completely Different Name"
        )
        assert len(candidates) == 0

    async def test_date_boosts_confidence(self, db_session: AsyncSession):
        person = Person(
            canonical_name="John Smith",
            birth_date=date(1950, 1, 1),
        )
        db_session.add(person)
        await db_session.commit()

        candidates_with_date = await find_match_candidates(
            db=db_session,
            name="John Smith",
            birth_date=date(1950, 1, 1),
        )
        candidates_without_date = await find_match_candidates(
            db=db_session,
            name="John Smith",
        )

        assert len(candidates_with_date) >= 1
        assert len(candidates_without_date) >= 1
        assert (
            candidates_with_date[0].confidence >= candidates_without_date[0].confidence
        )

    async def test_legacy_count(self, db_session: AsyncSession, test_user):
        from app.models.legacy import Legacy

        person = Person(canonical_name="Person With Legacies")
        db_session.add(person)
        await db_session.flush()

        legacy = Legacy(
            name="Test Legacy",
            created_by=test_user.id,
            person_id=person.id,
        )
        db_session.add(legacy)
        await db_session.commit()

        candidates = await find_match_candidates(
            db=db_session, name="Person With Legacies"
        )
        assert len(candidates) >= 1
        assert candidates[0].legacy_count == 1

    async def test_exclude_person_id(self, db_session: AsyncSession):
        person = Person(canonical_name="Excluded Person")
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        candidates = await find_match_candidates(
            db=db_session,
            name="Excluded Person",
            exclude_person_id=person.id,
        )
        assert len(candidates) == 0
