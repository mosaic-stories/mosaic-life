"""Tests for Person schemas."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.person import PersonCreate, PersonMatchCandidate


class TestPersonCreate:
    def test_valid_minimal(self):
        schema = PersonCreate(canonical_name="John Smith")
        assert schema.canonical_name == "John Smith"
        assert schema.aliases == []
        assert schema.locations == []

    def test_valid_full(self):
        schema = PersonCreate(
            canonical_name="John Smith",
            aliases=["Johnny", "J. Smith"],
            birth_date=date(1950, 1, 1),
            death_date=date(2020, 6, 15),
            birth_date_approximate=True,
            locations=["Chicago, IL"],
        )
        assert schema.birth_date_approximate is True

    def test_name_required(self):
        with pytest.raises(ValidationError):
            PersonCreate(canonical_name="")

    def test_name_max_length(self):
        with pytest.raises(ValidationError):
            PersonCreate(canonical_name="x" * 201)


class TestPersonMatchCandidate:
    def test_match_candidate(self):
        candidate = PersonMatchCandidate(
            person_id="550e8400-e29b-41d4-a716-446655440000",
            canonical_name="John Smith",
            birth_year_range="1948-1952",
            death_year_range="2020",
            legacy_count=2,
            confidence=0.85,
        )
        assert candidate.confidence == 0.85
        assert candidate.legacy_count == 2
