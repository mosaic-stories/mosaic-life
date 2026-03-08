# Evolve Conversation to Story Stage Hardening Design

## Status

Approved approach: Option B

## Goal

Fix the pre-staging regressions in the conversation-to-story feature while choosing a durable handoff mechanism that survives reloads and deep links.

## Problem Summary

The current implementation has three confirmed issues:

1. The frontend ignores the cloned conversation returned by the evolve endpoint and creates a fresh conversation in the Evolve Workspace.
2. The backend defines evolve suggestion parsing but never emits the `evolve_suggestion` SSE event or strips the marker before persisting assistant text.
3. The evolve service creates a draft story from a conversation without rechecking current legacy membership.

## Chosen Approach

Use a route-based handoff for the cloned conversation id.

When a user evolves a conversation, the frontend will navigate to the Evolve Workspace with the new `story_id` and the returned cloned `conversation_id` in the URL query string. The workspace will treat that query param as the authoritative conversation to load for the initial persona instead of creating a new conversation.

This is more durable than navigation state because it survives refreshes, supports copied links, and keeps the evolve flow debuggable from the address bar.

## Design Details

### 1. Route-Based Conversation Handoff

The legacy chat evolve action will navigate to:

`/legacy/:legacyId/story/:storyId/evolve?conversation_id=:conversationId`

The Evolve Workspace will parse `conversation_id` from the query string during initialization.

If present, it will:

1. store that conversation id for the active persona,
2. skip automatic new-conversation creation for that persona,
3. set seed mode to `evolve_summary` when the story also has `source_conversation_id`.

If the query param is absent, the current create-new-conversation behavior remains the fallback.

### 2. Evolve Summary Seeding Behavior

The seed flow must support cloned conversations that already contain copied messages.

For `seed_mode=evolve_summary`, the client must still invoke the seed endpoint even when messages are already present in the local chat store. The backend already allows this mode to bypass the normal idempotency guard, so the frontend should not short-circuit.

The seed should run once per workspace load for that conversation and then trigger the existing Writer tool highlight.

### 3. SSE Evolve Suggestion Emission

At the end of a streamed assistant response, the backend will:

1. parse the accumulated text for the `<<EVOLVE_SUGGEST: ...>>` marker,
2. remove the marker from the persisted assistant message,
3. emit a dedicated `evolve_suggestion` SSE event if a reason was found,
4. emit the `done` event after the message has been saved.

This keeps the stored transcript clean and activates the existing frontend suggestion UI without changing the stream contract for normal chat consumers.

### 4. Authorization Hardening

Before the evolve service creates the draft story, it must verify that the user still has current membership in the primary linked legacy.

This should match the effective rule already used by normal story creation: the user must be a non-pending member of at least one linked legacy. In this flow, the evolve service can enforce that directly against the primary legacy selected from the conversation.

If membership is missing, the service should return `403` and create nothing.

## Files Expected To Change

- `apps/web/src/features/legacy/components/AISection.tsx`
- `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`
- `apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts`
- `services/core-api/app/routes/ai.py`
- `services/core-api/app/services/ai.py`
- related frontend and backend tests for evolve flow and SSE handling

## Validation

Minimum validation before staging:

1. backend evolve route/service tests cover the new `403` membership check,
2. backend SSE tests verify marker stripping and `evolve_suggestion` event emission,
3. frontend tests cover query-param conversation handoff and evolve-summary seed behavior,
4. `just validate-backend` passes,
5. frontend build passes in a supported Node environment.