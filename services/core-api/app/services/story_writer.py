"""StoryWriterAgent — standalone generation service for story evolution drafts."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.adapters.ai import LLMProvider

logger = logging.getLogger(__name__)

STYLES_DIR = Path(__file__).resolve().parent.parent / "config" / "writing_styles"

# Cache loaded style directives
_style_cache: dict[str, str] = {}


def load_style_directive(style: str) -> str:
    """Load a writing style directive from the config directory."""
    if style in _style_cache:
        return _style_cache[style]

    path = STYLES_DIR / f"{style}.txt"
    if not path.exists():
        msg = f"Writing style directive not found: {path}"
        raise FileNotFoundError(msg)

    content = path.read_text().strip()
    _style_cache[style] = content
    return content


CORE_INSTRUCTIONS = """You are a ghostwriter. The output should read as if the user wrote it themselves.

STRICT RULES:
- Only include details from the original story or the provided summary. NEVER invent names, dates, locations, or events.
- Use the names and terms from the relationship metadata. For example, if the user calls their grandfather "Papa," use "Papa" throughout.
- Produce the COMPLETE story text — not a diff, not a partial update, not notes about what changed.
- Do not include section headers, metadata, or commentary. Output only the story text.
- Do not start with a title unless the original story started with one.

LENGTH GUIDANCE:
- "similar" means stay within ~20% of the original word count.
- "shorter" means reduce word count — distil to essentials.
- "longer" means allow natural expansion with new details, but do not pad."""

REVISION_INSTRUCTIONS = """
REVISION MODE:
- You are revising a previous draft based on the user's feedback.
- Preserve everything the user did NOT ask to change.
- Apply the revision instructions precisely.
- Still produce the complete story text."""


class StoryWriterAgent:
    """Builds prompts and streams drafts for story evolution."""

    def build_system_prompt(
        self,
        writing_style: str,
        length_preference: str,
        legacy_name: str,
        relationship_context: str,
        is_revision: bool,
    ) -> str:
        """Assemble the full system prompt for draft generation."""
        style_directive = load_style_directive(writing_style)

        parts = [
            CORE_INSTRUCTIONS,
            f"\nWRITING STYLE:\n{style_directive}",
            f"\nLENGTH PREFERENCE: {length_preference}",
            f"\nRELATIONSHIP CONTEXT:\nThe story is about {legacy_name}. {relationship_context}".strip(),
        ]

        if is_revision:
            parts.append(REVISION_INSTRUCTIONS)

        return "\n".join(parts)

    def build_user_message(
        self,
        original_story: str,
        summary_text: str,
        previous_draft: str | None = None,
        revision_instructions: str | None = None,
    ) -> str:
        """Build the user message containing all context for generation."""
        parts = [
            "## Original Story\n",
            original_story,
            "\n\n## New Information from Conversation\n",
            summary_text,
        ]

        if previous_draft:
            parts.extend(
                [
                    "\n\n## Previous Draft\n",
                    previous_draft,
                ]
            )

        if revision_instructions:
            parts.extend(
                [
                    "\n\n## Revision Instructions\n",
                    revision_instructions,
                ]
            )

        if not previous_draft:
            parts.append(
                "\n\nPlease write the complete updated story incorporating "
                "the new information above."
            )
        else:
            parts.append(
                "\n\nPlease revise the draft according to the instructions above."
            )

        return "".join(parts)

    async def stream_draft(
        self,
        llm_provider: LLMProvider,
        system_prompt: str,
        user_message: str,
        model_id: str,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Stream the draft text from the LLM."""
        messages = [{"role": "user", "content": user_message}]

        async for chunk in llm_provider.stream_generate(
            messages=messages,
            system_prompt=system_prompt,
            model_id=model_id,
            max_tokens=max_tokens,
        ):
            yield chunk
