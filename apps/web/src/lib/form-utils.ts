/**
 * Shared form utilities for normalizing form data before API submission.
 */

/**
 * Converts an empty or whitespace-only string to null, otherwise trims it.
 * Use when serializing optional text fields for API payloads.
 */
export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}
