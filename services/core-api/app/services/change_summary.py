"""Change summary generation for story versions.

Uses an LLM to generate concise summaries of what changed between two versions
of a story. Falls back to generic summaries when the LLM is unavailable.
"""

import asyncio
import logging
import time
from uuid import UUID

from opentelemetry import trace

from ..config import get_settings
from ..config.ai_rate_limits import CHANGE_SUMMARY_CONCURRENCY
from ..observability.metrics import (
    STORY_CHANGE_SUMMARY,
    STORY_CHANGE_SUMMARY_DURATION,
)
from ..providers.registry import get_provider_registry
from .ai_concurrency import AIConcurrencyLimitError, ai_concurrency_guard

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.change_summary")

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
    user_id: UUID,
    story_id: UUID,
    version_id: UUID,
    source: str = "manual_edit",
    source_version: int | None = None,
) -> str:
    """Generate a change summary using an LLM.

    Runs as a post-commit background upgrade (design.md Decision 4): the
    caller has already committed a version with a deterministic fallback
    summary before invoking this function, so there is no request/response
    cycle and no client to apply backpressure to. ``old_content`` is expected
    to be the content of the *previous version* -- the state as of the last
    version boundary -- not a snapshot from moments earlier, so the generated
    summary describes the whole editing session between boundaries rather
    than the last few keystrokes.

    ``story_id``/``version_id`` are recorded only as span attributes -- this
    call runs post-commit in the background, so they're what lets a slow or
    failing summary be correlated back to the story/version in traces.

    Collects streamed tokens from the provider's ``stream_generate`` method
    and returns the concatenated, stripped result. The call is bounded by
    ``settings.change_summary_timeout_seconds`` and by a per-user concurrency
    guard (``ai_concurrency_guard``, bucket ``change_summary``); both of
    these, like any other failure, fall back to a deterministic summary
    rather than propagating -- there is no client here to reject with a 429.

    This function **never raises** -- it always returns a string.
    """
    settings = get_settings()
    model_id = settings.change_summary_model_id
    started = time.perf_counter()
    outcome = "generated"

    with tracer.start_as_current_span("story.change_summary") as span:
        try:
            async with ai_concurrency_guard(
                user_id, bucket="change_summary", limit=CHANGE_SUMMARY_CONCURRENCY
            ):
                async with asyncio.timeout(settings.change_summary_timeout_seconds):
                    registry = get_provider_registry()
                    provider = registry.get_llm_provider()

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
                        model_id=model_id,
                        max_tokens=96,
                    ):
                        chunks.append(chunk)

                    result = "".join(chunks).strip()
                    if not result:
                        outcome = "fallback_error"
                        return _fallback_summary(source, source_version)
                    return result

        except TimeoutError:
            outcome = "fallback_timeout"
            logger.warning(
                "change_summary.timeout",
                extra={
                    "source": source,
                    "timeout_seconds": settings.change_summary_timeout_seconds,
                },
            )
            return _fallback_summary(source, source_version)

        except AIConcurrencyLimitError:
            outcome = "fallback_concurrency"
            logger.warning(
                "change_summary.concurrency_limited",
                extra={"source": source, "user_id": str(user_id)},
            )
            return _fallback_summary(source, source_version)

        except Exception:
            outcome = "fallback_error"
            logger.warning(
                "change_summary.generation_failed",
                extra={"source": source},
                exc_info=True,
            )
            return _fallback_summary(source, source_version)

        finally:
            span.set_attribute("story_id", str(story_id))
            span.set_attribute("version_id", str(version_id))
            span.set_attribute("outcome", outcome)
            span.set_attribute("model_id", model_id)
            STORY_CHANGE_SUMMARY.labels(outcome=outcome).inc()
            STORY_CHANGE_SUMMARY_DURATION.observe(time.perf_counter() - started)


def _fallback_summary(source: str, source_version: int | None = None) -> str:
    """Generate a generic fallback summary based on source type."""
    template = FALLBACK_SUMMARIES.get(source, "Content updated")
    if source_version is not None:
        return template.format(source_version=source_version)
    return template


def fallback_summary(source: str, source_version: int | None = None) -> str:
    """Public entry point for the deterministic fallback summary text.

    ``mint_version_at_boundary`` (app.services.story_version) needs this
    exact string twice: once up front, to write as the version's
    ``change_summary`` so the column is never null, and again later, as the
    guard value for the post-commit upgrade so a slow or failed generation
    can never clobber a summary another writer already replaced it with
    (e.g. a restoration). Exposed as a thin wrapper so callers outside this
    module never duplicate the fallback strings themselves.
    """
    return _fallback_summary(source, source_version)
