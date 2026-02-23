"""Person matching and management service."""

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.legacy import Legacy
from ..models.person import Person
from ..schemas.person import PersonMatchCandidate

logger = logging.getLogger(__name__)

# Confidence weights
NAME_WEIGHT = 0.4
ALIAS_WEIGHT = 0.15
BIRTH_DATE_WEIGHT = 0.2
DEATH_DATE_WEIGHT = 0.15
LOCATION_WEIGHT = 0.1

NAME_SIMILARITY_FLOOR = 0.3


def _date_proximity_score(d1: date | None, d2: date | None) -> float:
    """Score date proximity: exact=1.0, ±1yr=0.7, ±2yr=0.4, else 0.0."""
    if d1 is None or d2 is None:
        return 0.0
    diff = abs((d1 - d2).days)
    if diff == 0:
        return 1.0
    if diff <= 365:
        return 0.7
    if diff <= 730:
        return 0.4
    return 0.0


def _get_dialect_name(db: AsyncSession) -> str:
    """Detect the database dialect name from the async session."""
    try:
        # SQLAlchemy 2.x: access sync_session's bind if available
        sync_session = db.sync_session
        if sync_session.bind is not None:
            return sync_session.bind.dialect.name
    except Exception:
        pass
    # Fall back to "unknown" which triggers the SQLite-compatible path
    return "unknown"


async def find_match_candidates(
    db: AsyncSession,
    name: str,
    birth_date: date | None = None,
    death_date: date | None = None,
    locations: list[str] | None = None,
    exclude_person_id: UUID | None = None,
    limit: int = 5,
) -> list[PersonMatchCandidate]:
    """Find person match candidates for the given search criteria.

    Uses pg_trgm similarity on PostgreSQL for fuzzy name matching, with
    a LIKE-based fallback for SQLite (used in tests).

    Args:
        db: Database session.
        name: Name to match against.
        birth_date: Optional birth date to boost confidence.
        death_date: Optional death date to boost confidence.
        locations: Optional list of locations to boost confidence.
        exclude_person_id: Optional person ID to exclude from results.
        limit: Maximum number of candidates to return.

    Returns:
        List of PersonMatchCandidate ordered by descending confidence.
    """
    dialect_name = _get_dialect_name(db)

    if dialect_name == "postgresql":
        similarity_col = func.similarity(Person.canonical_name, name)
        query = (
            select(
                Person,
                similarity_col.label("name_sim"),
                func.count(Legacy.id).label("legacy_count"),
            )
            .outerjoin(Legacy, Legacy.person_id == Person.id)
            .where(similarity_col >= NAME_SIMILARITY_FLOOR)
            .group_by(Person.id)
            .order_by(similarity_col.desc())
            .limit(limit * 2)
        )
    else:
        # SQLite fallback: LIKE-based matching (case-insensitive via ilike)
        query = (
            select(
                Person,
                func.count(Legacy.id).label("legacy_count"),
            )
            .outerjoin(Legacy, Legacy.person_id == Person.id)
            .where(Person.canonical_name.ilike(f"%{name}%"))
            .group_by(Person.id)
            .limit(limit * 2)
        )

    if exclude_person_id is not None:
        query = query.where(Person.id != exclude_person_id)

    result = await db.execute(query)
    rows = result.all()

    candidates: list[PersonMatchCandidate] = []
    for row in rows:
        person: Person = row[0]
        legacy_count: int = row.legacy_count

        # Name similarity score
        if dialect_name == "postgresql":
            name_score = float(row.name_sim)
        else:
            # Simple string matching score for SQLite
            person_name_lower = person.canonical_name.lower()
            name_lower = name.lower()
            if person_name_lower == name_lower:
                name_score = 1.0
            elif name_lower in person_name_lower:
                name_score = 0.7
            else:
                name_score = 0.5

        # Date scores
        birth_score = _date_proximity_score(birth_date, person.birth_date)
        death_score = _date_proximity_score(death_date, person.death_date)

        # Location overlap score
        location_score = 0.0
        if locations and person.locations:
            person_locs = {loc.lower() for loc in person.locations}
            input_locs = {loc.lower() for loc in locations}
            overlap = len(person_locs & input_locs)
            total = max(len(person_locs | input_locs), 1)
            location_score = overlap / total

        # Alias match bonus
        alias_score = 0.0
        if person.aliases:
            for alias in person.aliases:
                if name.lower() in alias.lower() or alias.lower() in name.lower():
                    alias_score = 1.0
                    break

        # Weighted confidence
        confidence = (
            name_score * NAME_WEIGHT
            + alias_score * ALIAS_WEIGHT
            + birth_score * BIRTH_DATE_WEIGHT
            + death_score * DEATH_DATE_WEIGHT
            + location_score * LOCATION_WEIGHT
        )

        # Build year range strings
        birth_year_range: str | None = None
        if person.birth_date:
            year = person.birth_date.year
            if person.birth_date_approximate:
                birth_year_range = f"{year - 2}-{year + 2}"
            else:
                birth_year_range = str(year)

        death_year_range: str | None = None
        if person.death_date:
            year = person.death_date.year
            if person.death_date_approximate:
                death_year_range = f"{year - 2}-{year + 2}"
            else:
                death_year_range = str(year)

        candidates.append(
            PersonMatchCandidate(
                person_id=person.id,
                canonical_name=person.canonical_name,
                birth_year_range=birth_year_range,
                death_year_range=death_year_range,
                legacy_count=legacy_count,
                confidence=round(min(confidence, 1.0), 3),
            )
        )

    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:limit]
