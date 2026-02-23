"""Tests for Person model."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.person import Person
from app.models.user import User


@pytest.mark.asyncio
class TestPersonModel:
    async def test_create_person(self, db_session: AsyncSession):
        person = Person(
            canonical_name="John Smith",
            aliases=["Johnny", "J. Smith"],
            locations=["Chicago, IL"],
        )
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        assert person.id is not None
        assert person.canonical_name == "John Smith"
        assert person.aliases == ["Johnny", "J. Smith"]
        assert person.locations == ["Chicago, IL"]
        assert person.birth_date is None
        assert person.death_date is None
        assert person.birth_date_approximate is False
        assert person.death_date_approximate is False

    async def test_create_person_with_dates(self, db_session: AsyncSession):
        from datetime import date

        person = Person(
            canonical_name="Jane Doe",
            birth_date=date(1950, 3, 15),
            death_date=date(2020, 11, 1),
            birth_date_approximate=True,
        )
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        assert person.birth_date == date(1950, 3, 15)
        assert person.death_date == date(2020, 11, 1)
        assert person.birth_date_approximate is True
        assert person.death_date_approximate is False

    async def test_person_repr(self, db_session: AsyncSession):
        person = Person(canonical_name="Test Person")
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        assert "Test Person" in repr(person)


@pytest.mark.asyncio
class TestLegacyPersonRelationship:
    async def test_legacy_has_person_id(
        self, db_session: AsyncSession, test_user: User
    ):
        person = Person(canonical_name="Test Person")
        db_session.add(person)
        await db_session.flush()

        legacy = Legacy(
            name="Test Legacy",
            created_by=test_user.id,
            person_id=person.id,
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.person_id == person.id
