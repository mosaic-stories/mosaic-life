# Markdown as Canonical Story Content Format

**Date:** 2026-02-21
**Status:** Approved
**Related:** [Frontend Architecture Refactoring](completed/2026-02-21-frontend-architecture-refactoring.md), [Story Evolution Design](2026-02-17-story-evolution-design.md)

---

## Problem

Phase 5 of the frontend refactoring replaced the story `<textarea>` with a TipTap rich text editor that stores HTML in the `content` field. This creates format mismatches across every other consumer of story content:

1. **Evolution workspace** — Original story panel, `DraftStreamPanel`, and `DraftReviewPanel` render content with `whitespace-pre-wrap` in a plain `<div>`. HTML content displays as raw tags.
2. **Story writer agent** — Injects `story.content` directly into LLM prompts. HTML markup pollutes the prompt and wastes tokens.
3. **Chunking pipeline** — Splits on `\n\n` (double newlines). HTML like `<p>foo</p><p>bar</p>` has no double newlines, breaking chunk boundaries.
4. **Draft generation output** — The `StoryWriterAgent` streams Markdown/plain text. Accepting a draft overwrites the HTML-formatted story, losing all formatting on the next edit.

## Decision

**Markdown is the canonical storage format for all story content.** Conversion between Markdown and TipTap's internal representation happens at a single boundary — the editor component.

## Approach

### Conversion Boundary: TipTap Editor Only

- **On load:** `editor.commands.setContent(markdownString, { contentType: 'markdown' })` — TipTap's built-in Markdown extension parses Markdown into ProseMirror document structure.
- **On save:** `editor.getMarkdown()` — TipTap serializes its internal state back to Markdown.

### Everything Else Speaks Markdown Natively

| Consumer | Current behavior | After change |
|----------|-----------------|--------------|
| Story writer agent | Receives content string, outputs text | No change — Markdown in prompt is cleaner |
| Chunking pipeline | Splits on `\n\n` | No change — Markdown paragraphs use `\n\n` |
| Embedding pipeline | Embeds content string | No change — Markdown is near-plain-text |
| Evolution workspace panels | `whitespace-pre-wrap` div (broken with HTML) | `streamdown` Markdown renderer |
| LLM prompt injection | Raw string in prompt | No change — Markdown is clean in prompts |

### Migration

No migration needed. All stories in staging/production are plain text. TipTap handles plain text on load (wraps in paragraphs internally). `getMarkdown()` serializes cleanly. Lazy conversion on next save.

## Frontend Library Choices

### TipTap Markdown Extension

- **Package:** `@tiptap/extension-markdown`
- **Adds:** `editor.getMarkdown()` and `editor.commands.setContent(md, { contentType: 'markdown' })`
- **Replaces:** Current `getHTML()` / `setContent(html)` pattern in `useStoryEditor.ts`
- **No changes** to existing extensions (StarterKit, Placeholder, Image, Link)

### Streaming Markdown Renderer

- **Package:** `streamdown` (Vercel)
- **Purpose:** Renders Markdown in non-editor contexts, handles incomplete Markdown during SSE streaming gracefully
- **Used in:** Evolution workspace original story panel (static mode), `DraftStreamPanel` (streaming mode), `DraftReviewPanel` (streaming mode)
- **Replaces:** Raw `whitespace-pre-wrap` divs

## Backend Impact

**None.** The backend is format-agnostic — `content` is an opaque text field. Markdown works better with the chunking pipeline (`\n\n` splits), embedding pipeline (less noise), and LLM prompts (no HTML tags).

## Files Changed

| File | Change |
|------|--------|
| `features/editor/hooks/useStoryEditor.ts` | Replace `getHTML()` with `getMarkdown()`, replace `setContent(html)` with `setContent(md, { contentType: 'markdown' })` |
| `features/editor/components/StoryEditor.tsx` | Update content sync effect to compare Markdown instead of HTML |
| `features/story-evolution/StoryEvolutionWorkspace.tsx` | Replace `whitespace-pre-wrap` div with `streamdown` static renderer |
| `features/story-evolution/DraftStreamPanel.tsx` | Replace `whitespace-pre-wrap` div with `streamdown` streaming renderer |
| `features/story-evolution/DraftReviewPanel.tsx` | Replace `whitespace-pre-wrap` div with `streamdown` streaming renderer |
| `apps/web/package.json` | Add `@tiptap/extension-markdown`, `streamdown` |

## Formatting Scope

Minimal formatting only: bold, italic, headings (H2/H3), lists, blockquotes. This matches the TipTap extensions already configured and covers what story prose needs.

## Estimated Impact

~6 files modified, ~100 lines changed, 2 new dependencies. Zero backend changes.
