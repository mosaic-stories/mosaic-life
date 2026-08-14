"""Tuning constants for per-user AI endpoint rate limiting.

Each bucket defines:
- A list of (window_seconds, max_count) frequency thresholds that must ALL
  hold (see ``app.services.ai_rate_limit.enforce_ai_rate_limit``).
- A concurrency limit (max simultaneous in-flight requests per user).

This module is a plain, single-place tuning point — no settings/env-var
mechanism is needed. Edit the constants below to change limits.
"""

CHAT_MESSAGE_THRESHOLDS: list[tuple[int, int]] = [(60, 20), (3600, 200)]
CHAT_MESSAGE_CONCURRENCY = 2

STORY_REWRITE_THRESHOLDS: list[tuple[int, int]] = [(3600, 10)]
STORY_REWRITE_CONCURRENCY = 1

STORY_CONTEXT_EXTRACT_THRESHOLDS: list[tuple[int, int]] = [(3600, 50)]
STORY_CONTEXT_EXTRACT_CONCURRENCY = 1

STORY_EVOLUTION_THRESHOLDS: list[tuple[int, int]] = [(3600, 20)]
STORY_EVOLUTION_CONCURRENCY = 1

# Change-summary generation (app.services.change_summary) runs post-commit in
# the background (design.md Decision 4 of story-save-path-performance): there
# is no client waiting on it and therefore nothing to apply backpressure to,
# so unlike the buckets above there is no paired frequency-threshold list --
# only a concurrency cap bounding worst-case fleet-wide LLM load.
CHANGE_SUMMARY_CONCURRENCY = 2
