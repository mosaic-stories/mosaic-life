# Persona Selector in Evolve Workspace AI Chat

**Date:** 2026-02-28
**Status:** Approved

## Problem

The AI Chat panel in the Evolve workspace hardcodes the Biographer persona. Users cannot see which persona they are talking to or switch between personas. The backend already supports multiple personas (biographer, friend, colleague, family) and per-persona conversations, but the evolve workspace UI does not expose this.

## Decisions

- **Personas available:** Phase 1 only — Biographer and Friend
- **Conversation model:** Separate conversations per persona (backend already supports this). Switching back to a previously used persona restores its conversation history.
- **UI placement:** Compact dropdown header inside the AI chat panel
- **New persona greeting:** Auto-seed with persona-specific opening message (existing seed mechanism)
- **State management:** Workspace store owns `activePersonaId` and a `conversationIds` map

## Design

### State Changes (useEvolveWorkspaceStore)

New fields:
- `activePersonaId: string` — defaults to `'biographer'`
- `conversationIds: Record<string, string>` — maps `personaId → conversationId` for the current session
- `setActivePersona(personaId: string): void`
- `setConversationForPersona(personaId: string, conversationId: string): void`

These reset with the existing `reset()` call on unmount.

### Conversation Lifecycle

When `activePersonaId` changes (or on mount):
1. Check `conversationIds[activePersonaId]`
2. If exists → use that conversation (messages already cached in AI chat store)
3. If not → call `createNewConversation({ persona_id, legacies })`, store the returned ID, let `useConversationSeed` fire the greeting

Replaces the hardcoded `'biographer'` init in EvolveWorkspace.tsx.

### UI: PersonaSelector Component

Compact dropdown at the top of AIChatTool:

```
┌──────────────────────────────────┐
│ 📖 The Biographer          ▾    │  <- clickable dropdown
├──────────────────────────────────┤
│ Chat messages...                 │
├──────────────────────────────────┤
│ [textarea]            [Send]     │
└──────────────────────────────────┘
```

- Data from `usePersonas()` hook (GET /api/ai/personas), filtered to `['biographer', 'friend']`
- Shows persona icon + name, checkmark on active
- Disabled while streaming
- Works in both desktop ToolPanel and mobile MobileToolSheet

### Files to Change

| File | Change |
|------|--------|
| `useEvolveWorkspaceStore.ts` | Add `activePersonaId`, `conversationIds`, `setActivePersona`, `setConversationForPersona` |
| `EvolveWorkspace.tsx` | Read `activePersonaId` from store; refactor conversation init to use `conversationIds` map |
| `AIChatTool.tsx` | Add PersonaSelector header; read `activePersonaId` from store |
| New: `PersonaSelector.tsx` | Dropdown component in `evolve-workspace/components/` |

### No Backend Changes

The backend already supports all required operations:
- `GET /api/ai/personas` — list personas
- `POST /api/ai/conversations/new` — create per-persona conversation
- `POST /api/ai/conversations/{id}/seed` — seed greeting per persona
- Persona system prompts and graph traversal config already defined per persona in `personas.yaml`

### Edge Cases

- **Switching while streaming:** Dropdown disabled during streaming
- **Unmount/remount:** `conversationIds` map resets with workspace store (fresh conversations next visit)
- **Mobile:** Same selector in MobileToolSheet chat view

## Next Steps

Create an implementation plan and execute in a fresh session. Key implementation order:
1. Store changes (add state fields)
2. Refactor conversation init in EvolveWorkspace
3. Build PersonaSelector component
4. Wire into AIChatTool
5. Handle mobile layout
