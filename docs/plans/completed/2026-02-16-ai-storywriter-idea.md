# Mosaic Life: Story Evolution Feature Specification

## Document Purpose

This document captures the design decisions, architecture, and implementation plan for the Story Evolution feature in Mosaic Life. It is intended to be used as a reference for development sessions with AI coding agents (e.g., Claude Code) against the existing codebase.

---

## Feature Overview

Story Evolution enables users to deepen and expand existing stories about a Legacy through guided conversation with AI personas. A user initiates the flow from an existing story, engages in a Socratic elicitation conversation with a persona, and then a specialized writing agent produces a new version of the story incorporating the details surfaced during the conversation. The user reviews, iterates, and ultimately accepts or discards the draft.

### Key Principles

- The conversational persona is always the user's primary interaction point — users never interact directly with the writing agent.
- Story generation is delegated to an independent writing agent with a focused scope.
- Only the active version of a story is available for RAG retrieval by personas.
- All version transitions (old → new active) are atomic operations.
- Conversation-to-story attribution is optional, since conversations can be independently deleted.

---

## User Flow

### Entry Point

The user navigates to an existing story and clicks a button (e.g., "Let's talk about this story"). This initiates a scoped conversation session.

### Phase 1: Elicitation Conversation

The conversational persona enters elicitation mode. The full text of the active story version is loaded into context (not via RAG). RAG remains available for adjacent stories to support cross-referencing.

The persona's behavior shifts to be more Socratic and probing. The persona should:

- Ask about sensory details, emotions, timing, other people present, and what the moment meant to the user.
- Cross-reference adjacent stories when relevant (e.g., "You mentioned something similar in your fishing trip story — was this the same summer?").
- Never fabricate details — only work with what the user provides.

The UI should display a subtle indicator showing the session is linked to a specific story (e.g., "Evolving: [Story Title]").

### Phase 2: Pre-Draft Summary and Confirmation

Before handing off to the writing agent, the conversational persona produces a structured summary of the new information learned from the conversation. This summary is presented to the user as a verification checkpoint.

The user can:

- Confirm the summary is accurate and complete.
- Add missing details or correct inaccuracies.
- Continue the elicitation conversation to surface more details.

### Phase 3: Style and Length Selection

Before draft generation, the user selects:

- **Writing style** — one of the available styles (see Writing Agent section below).
- **Story length preference** — keep similar to original, make shorter, or allow it to grow.

These selections should be presented in the UI as part of the handoff flow.

### Phase 4: Draft Generation

The conversational persona explicitly signals the handoff: "I'm going to hand this off to craft a draft for you. You'll be able to review it and ask for changes."

The writing agent receives:

- The original story text (active version).
- The structured summary of new details (from Phase 2).
- The user's relationship metadata for this Legacy.
- The selected writing style.
- The selected length preference.
- Optionally, a style fingerprint derived from the user's existing stories (for the "natural" style).

The writing agent produces a draft.

### Phase 5: Draft Review and Iteration

The draft is presented to the user alongside a "What's New" summary describing what changed from the original story. The summary should highlight: new details added, sections expanded, new people or events incorporated, and any structural changes.

All feedback and revision requests go through the conversational persona. The user interacts with the same persona they were chatting with. The persona relays editorial feedback and new information to the writing agent for regeneration.

Types of user feedback:

- **Editorial feedback** (e.g., "make paragraph two longer," "change the ending") — the persona passes this to the writing agent.
- **New facts** (e.g., "I forgot to mention Uncle Ray was there") — the persona incorporates these into the context and triggers a new writing agent pass.

The user can also independently edit the draft text directly in a separate area of the application at any time.

### Phase 6: Acceptance or Discard

The user either accepts the draft or discards it.

**On acceptance:**

1. The new version is stored in the database.
2. The new version is set as active (atomic transition).
3. The old version's embeddings are deactivated.
4. The new version is chunked and embedded.
5. The source conversation ID is stored as optional provenance metadata on the new version.

**On discard:** No changes are made to the story or its versions.

---

## Writing Agent Architecture

### Single Agent, Parameterized Style

The writing agent is a single agent with a core set of instructions that remain constant across all styles. A style directive section is swapped in based on the user's selection. This approach keeps maintenance simple and allows new styles to be added without deploying new agent infrastructure.

### Core Instructions (All Styles)

- Only include details the user provided in conversation or that exist in the original story.
- Never invent names, dates, locations, or events.
- Respect the user's relationship metadata — use the names and terms they use for the Legacy.
- Produce output that reads as if the user wrote it (ghostwriting, not AI narration).
- Adhere to the selected length preference.

### Writing Styles

**Natural** — Align with the user's existing writing style. Requires a style fingerprint generated by analyzing 3-5 of the user's existing stories via prompt. The fingerprint captures characteristics such as: average sentence length, vocabulary complexity, use of dialogue vs. narration, tense preference, first-person vs. third-person tendency, and emotional language density. The fingerprint should be cached per user-per-Legacy and refreshed when new stories are published.

**Vivid** — Paint a mental picture. Emphasize sensory details, setting, atmosphere, and descriptive language. Bring scenes to life with specific imagery.

**Emotional** — Focus on the emotional arc. Foreground feelings, relationships, internal experience, and what moments meant to the people involved.

**Conversational** — Align with the tone and voice of the conversational AI persona the user was chatting with. More informal, personal, and direct.

**Concise** — Distilled and tight. Suitable for stories that might be read aloud at a gathering or displayed on a memorial page. Prioritize impact per word.

**Documentary** — More factual, chronological, and third-person. Reads like a biography chapter. Especially useful when the contributor didn't know the Legacy personally and is recording secondhand accounts.

---

## Conversational Persona: Elicitation Mode

When a story evolution session is active, the conversational persona's system prompt should be augmented with an elicitation mode directive. This directive should:

- Instruct the persona to ask probing, open-ended questions about the story.
- Encourage the persona to explore sensory details, emotions, timeline, other people involved, and the significance of the moment.
- Allow the persona to cross-reference other stories via RAG.
- Instruct the persona to never fabricate or suggest details — only elicit from the user.
- Instruct the persona to track new information surfaced during the conversation internally so it can produce a summary at handoff.

Different personas will naturally elicit different kinds of detail:

- **Biographer** — Asks about timeline, context, historical significance, cause and effect.
- **Friend** — Asks about feelings, shared experiences, inside jokes, informal moments.
- **Coworker** — Asks about professional context, collaboration, work dynamics.
- **Digital Twin** — Asks "what would [Legacy person] have said about this?" Explores the Legacy's perspective.

This means the same story evolved through different personas may produce meaningfully different new versions.

---

## Data Model Changes

### Conversation Sessions

Add or extend the conversation session model:

- `purpose` — enum: `free_chat`, `story_evolution`, `story_creation`
- `linked_story_id` — optional FK to the story being evolved
- `linked_story_version` — the version number at the time the session started
- `writing_style` — the style selected for draft generation
- `length_preference` — enum: `similar`, `shorter`, `longer`

### Story Versions

Extend the story version model:

- `source_conversation_id` — optional FK to the conversation that produced this version (optional because conversations can be independently deleted)
- `status` — enum: `draft`, `active`, `inactive`

The `draft` status allows users to leave and return to an in-progress draft without it being visible to personas or other users.

### Style Fingerprint Cache

- `user_id` — FK to user
- `legacy_id` — FK to Legacy
- `fingerprint_text` — the generated style summary
- `generated_at` — timestamp
- `story_count_at_generation` — number of stories analyzed (used to determine when refresh is needed)

---

## Embedding and Version Lifecycle

Only active story versions are chunked and embedded for RAG. Draft versions are explicitly excluded.

The version transition on acceptance must be atomic:

1. Set old active version status to `inactive`.
2. Remove old version's embeddings from pgvector.
3. Set new version status to `active`.
4. Chunk and embed the new version.
5. Update the story's `active_version` pointer.

If any step fails, roll back the entire operation. Much of this logic should already exist in the current versioning system.

---

## Context Packaging for Writing Agent

When the conversational persona triggers the handoff, the following context is assembled for the writing agent:

1. **Original story text** — the full active version being evolved.
2. **Structured summary of new details** — produced by the conversational persona, confirmed by the user.
3. **User relationship metadata** — what the user calls the Legacy, who the Legacy is to the user, who the user is to the Legacy, etc.
4. **Selected writing style** — with the corresponding style directive.
5. **Selected length preference.**
6. **Style fingerprint** — only for the "natural" style; the cached analysis of the user's writing patterns.
7. **Adjacent stories** (optional) — a small number of other stories by this user for tonal consistency and cross-reference.

---

## Future Considerations (Not in Initial Scope)

### Organic Story Creation from Conversation

A future workflow where a user is in a free conversation with a persona, and a story naturally emerges. The user can indicate they want to create a new story from the conversation. This can be user-initiated ("that would make a great story") or persona-suggested (the persona recognizes narrative density and offers to help shape it). This shares the same writing agent and draft review pipeline.

### Persona-Aware Evolution Tracking

Track which persona was used for each evolution session. Surface this to users with suggestions like: "You last evolved this story with the Biographer. Want to try exploring it with the Friend persona this time?"

### Multi-Contributor Evolution

When someone other than the original author wants to evolve a story. Options include branching the story, creating contributor-specific variants, or merging contributions. The versioning system should be extensible to support this.

### Metrics and Learning

Track over time: style selected, revision count per session, accepted vs. discarded rate, time-to-acceptance, and which personas produce the richest elicitation conversations. Use this data to tune prompts and prioritize features.

---

## Implementation Sequencing

### Phase 1: Core Story Evolution Flow

1. UI entry point on existing stories ("Let's talk about this story").
2. Scoped conversation session with elicitation mode system prompt augmentation.
3. Full story context loading (not RAG) for the linked story.
4. Conversational persona summary generation at handoff.
5. User verification checkpoint for the summary.
6. Writing style and length preference selection UI.
7. Writing agent implementation (single agent, parameterized style) — start with Vivid, Emotional, Conversational, and Concise styles.
8. Draft presentation with "What's New" summary.
9. Iterative feedback loop through conversational persona.
10. Acceptance flow with atomic version transition.

### Phase 2: Natural Style and Fingerprinting

1. Style fingerprint generation from existing user stories.
2. Fingerprint caching and refresh logic.
3. Natural style directive integration into writing agent.

### Phase 3: Additional Styles and Polish

1. Documentary style.
2. Any additional styles identified through user feedback.
3. Persona-specific elicitation tuning.
4. Metrics tracking.

### Phase 4: Organic Story Creation

1. Story creation from free conversation.
2. Persona-suggested story capture.
3. Shared pipeline convergence with story evolution flow.