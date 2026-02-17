"""Change summary generation for story versions.

Uses an LLM to generate concise summaries of what changed between two versions
of a story. Falls back to generic summaries when the LLM is unavailable.
"""

import logging

from ..config import get_settings
from ..providers.registry import get_provider_registry

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = (
    "You are a concise editor. Compare two versions of a story and write a "
    "brief 1-sentence summary of what changed. Focus on the nature of the "
    "change. Be concise."
)

SUMMARY_USER_PROMPT = """Old version:
{old_content}

New version:
{new_content}

Summary of changes (one sentence):"""

FALLBACK_SUMMARIES: dict[str, str] = {
    "manual_edit": "Manual edit",
    "ai_enhancement": "AI enhancement",
    "ai_interview": "AI interview update",
    "restoration": "Restored from version {source_version}",
}


async def generate_change_summary(
    old_content: str,
    new_content: str,
    source: str = "manual_edit",
    source_version: int | None = None,
) -> str:
    """Generate a change summary using an LLM.

    Collects streamed tokens from the provider's ``stream_generate`` method
    and returns the concatenated, stripped result.  If the LLM call fails
    for any reason, a deterministic fallback summary is returned instead.

    This function **never raises** -- it always returns a string.
    """
    try:
        registry = get_provider_registry()
        provider = registry.get_llm_provider()
        settings = get_settings()

        # Truncate to avoid excessive token usage
        old_truncated = old_content[:2000]
        new_truncated = new_content[:2000]

        user_message = SUMMARY_USER_PROMPT.format(
            old_content=old_truncated,
            new_content=new_truncated,
        )

        messages = [{"role": "user", "content": user_message}]

        # Collect stream output
        chunks: list[str] = []
        async for chunk in provider.stream_generate(
            messages=messages,
            system_prompt=SUMMARY_SYSTEM_PROMPT,
            model_id=settings.openai_chat_model,
            max_tokens=100,
        ):
            chunks.append(chunk)

        result = "".join(chunks).strip()
        return result if result else _fallback_summary(source, source_version)

    except Exception:
        logger.warning(
            "change_summary.generation_failed",
            extra={"source": source},
            exc_info=True,
        )
        return _fallback_summary(source, source_version)


def _fallback_summary(source: str, source_version: int | None = None) -> str:
    """Generate a generic fallback summary based on source type."""
    template = FALLBACK_SUMMARIES.get(source, "Content updated")
    if source_version is not None:
        return template.format(source_version=source_version)
    return template
