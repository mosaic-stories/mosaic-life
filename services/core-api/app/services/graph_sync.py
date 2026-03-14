"""Utilities for syncing data to the graph database.

Shared by entity extraction ingestion and member profile sync.
"""

from __future__ import annotations

# Family relationship types
_FAMILY_TYPES = frozenset({
    "parent", "child", "spouse", "sibling",
    "grandparent", "grandchild", "aunt", "uncle",
    "cousin", "niece", "nephew", "in_law",
})

# Work relationship types
_WORK_TYPES = frozenset({"colleague", "mentor", "mentee"})

# Friend relationship types
_FRIEND_TYPES = frozenset({"friend", "neighbor"})

# Confidence threshold for WRITTEN_ABOUT classification
_WRITTEN_ABOUT_CONFIDENCE = 0.9


def categorize_relationship(relationship_type: str | None) -> str:
    """Map a relationship type string to a graph edge label.

    Returns one of: FAMILY_OF, WORKED_WITH, FRIENDS_WITH, KNEW.
    """
    if relationship_type is None:
        return "KNEW"
    rt = relationship_type.lower().strip()
    if rt in _FAMILY_TYPES:
        return "FAMILY_OF"
    if rt in _WORK_TYPES:
        return "WORKED_WITH"
    if rt in _FRIEND_TYPES:
        return "FRIENDS_WITH"
    return "KNEW"


def normalize_person_id(name: str, legacy_id: str) -> str:
    """Build a deterministic person node ID from name and legacy."""
    normalized = " ".join(name.split()).lower().replace(" ", "-")
    return f"person-{normalized}-{legacy_id}"


def classify_story_person_edge(
    person_name: str,
    story_title: str,
    confidence: float,
) -> str:
    """Classify whether a person is WRITTEN_ABOUT or MENTIONS in a story.

    Heuristic:
    - Name appears in story title -> WRITTEN_ABOUT
    - Confidence >= 0.9 -> WRITTEN_ABOUT
    - Otherwise -> MENTIONS
    """
    if person_name.lower() in story_title.lower():
        return "WRITTEN_ABOUT"
    if confidence >= _WRITTEN_ABOUT_CONFIDENCE:
        return "WRITTEN_ABOUT"
    return "MENTIONS"
