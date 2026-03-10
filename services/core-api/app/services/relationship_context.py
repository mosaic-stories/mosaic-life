"""Formatter for member relationship context in AI system prompts."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.member_profile import MemberProfileResponse


def format_relationship_context(
    profile: MemberProfileResponse | None,
    legacy_name: str,
) -> str:
    """Format a member's relationship profile into a system prompt section.

    Returns an empty string if profile is None or has no populated fields.
    """
    if profile is None:
        return ""

    sections: list[str] = []

    # Nicknames — possessive framing
    if profile.nicknames:
        quoted = ", ".join(f'"{n}"' for n in profile.nicknames)
        possessive = ", ".join(f'"your {n}"' for n in profile.nicknames)
        sections.append(
            f"The user refers to {legacy_name} as {quoted}. "
            f"When the user says {quoted} or {possessive}, "
            f"they are referring to {legacy_name}. You should adapt — when the user "
            f"uses these nicknames, you may use the possessive form (e.g. "
            f'"your {profile.nicknames[0]}") to refer to {legacy_name}, '
            f'but default to "{legacy_name}" otherwise.'
        )

    # Relationship type
    if profile.relationship_type:
        sections.append(f"Relationship: {profile.relationship_type}")

    # Legacy to viewer
    if profile.legacy_to_viewer:
        sections.append(
            f"In the user's own words, {legacy_name} is to them: "
            f'"{profile.legacy_to_viewer}"'
        )

    # Viewer to legacy
    if profile.viewer_to_legacy:
        sections.append(
            f"In the user's own words, they are to {legacy_name}: "
            f'"{profile.viewer_to_legacy}"'
        )

    # Character traits
    if profile.character_traits:
        traits = ", ".join(profile.character_traits)
        sections.append(f"The user describes {legacy_name} as: {traits}")

    if not sections:
        return ""

    header = f"## Your Relationship with {legacy_name}"
    return header + "\n\n" + "\n\n".join(sections)
