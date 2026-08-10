/**
 * "Long response" signal used to decide whether to offer turning a response
 * into its own standalone story (see openspec/changes/response-to-story).
 *
 * A response is "long" when it has more than four sentences (5+), counted by
 * a simple `.?!`-terminator split. This is a length signal, not a quality
 * judgement (per the change's non-goals), and is expected to occasionally
 * miscount abbreviations, ellipses, or decimals — accepted for MVP. Isolated
 * here in one testable place so the threshold/algorithm can be tuned later
 * without touching callers.
 */
const LONG_RESPONSE_SENTENCE_THRESHOLD = 4;

export function isLongResponse(body: string): boolean {
  const sentenceCount = body
    .split(/[.?!]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0).length;

  return sentenceCount > LONG_RESPONSE_SENTENCE_THRESHOLD;
}
