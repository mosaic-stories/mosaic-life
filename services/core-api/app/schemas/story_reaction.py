"""Pydantic schemas for Story Reaction API."""

from typing import Literal

from pydantic import BaseModel, Field

ReactionType = Literal["heart", "candle", "smile"]


class StoryReactionToggleRequest(BaseModel):
    """Request to toggle a reaction on a story."""

    reaction_type: ReactionType = Field(
        ..., description="Reaction type to toggle: heart, candle, or smile"
    )


class StoryReactionToggleResponse(BaseModel):
    """Response from toggling a reaction.

    Returns all three counts (not just the toggled type's) so the caller can
    reconcile a story card/read-page's full reaction row from a single
    response, without a follow-up fetch.
    """

    reacted: bool = Field(
        description="Whether the reacting user now has this reaction active"
    )
    reaction_type: ReactionType = Field(
        description="The reaction type that was toggled"
    )
    reaction_heart_count: int = Field(description="Updated heart reaction count")
    reaction_candle_count: int = Field(description="Updated candle reaction count")
    reaction_smile_count: int = Field(description="Updated smile reaction count")
