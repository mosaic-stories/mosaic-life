# Inline AI Chat in Legacy Detail Page

**Date:** 2026-03-02
**Status:** Approved

## Goal

Replace the AI Interactions tab's demo card layout with the actual chat interface rendered inline. This eliminates the separate `/legacy/:legacyId/ai-chat` page, removes all demo badges and boilerplate, and keeps users within the Legacy detail page.

## Decisions

- **Persona selection:** Horizontal pills above chat (not sidebar)
- **Agent Panel:** Removed entirely (all demo, never implemented)
- **Conversation history:** Kept but simplified — New Chat button + lightweight history dropdown
- **Demo badges:** Removed completely. Feature presented as real.
- **Tab label:** Renamed from "AI Interactions" to "AI Chat"

## Layout

```
┌─────────────────────────────────────────────────────┐
│ Stories | Media Gallery | Linked Legacies | AI Chat  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [📖 Biographer]  [❤️ The Friend]    [+ New] [History▾]│
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │  (scrollable message area - MessageList)        ││
│  │                                                 ││
│  │  AI: "I'm so glad you want to explore..."      ││
│  │                                                 ││
│  │                  You: "Tell me about..."        ││
│  │                                                 ││
│  └─────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐ ┌────────┐│
│  │ Ask The Biographer anything...      │ │  Send  ││
│  └─────────────────────────────────────┘ └────────┘│
└─────────────────────────────────────────────────────┘
```

## Component Architecture

### Kept as-is (no changes)

| File | Reason |
|------|--------|
| `ai-chat/api/ai.ts` | API layer, no UI concerns |
| `ai-chat/store/aiChatStore.ts` | Zustand store, layout-agnostic |
| `ai-chat/hooks/useAIChat.ts` | All hooks work independently of layout |
| `ai-chat/components/ChatMessage.tsx` | Individual message renderer |
| `ai-chat/components/MessageList.tsx` | Scrollable message container |
| `ai-chat/components/ChatInput.tsx` | Input field |
| `ai-chat/components/PersonaIcon.tsx` | Icon renderer, reused in pills |
| `ai-chat/components/utils.ts` | Formatting helpers |

### Modified

| File | Change |
|------|--------|
| `legacy/components/AISection.tsx` | Rebuilt as chat host — persona pills, toolbar, MessageList + ChatInput, wires useAIChat |
| `legacy/components/SectionNav.tsx` | Tab label "AI Interactions" → "AI Chat", remove Demo badge |
| `ai-chat/components/ConversationHistoryPopover.tsx` | Verify works as lightweight dropdown in new context |
| `ai-chat/index.ts` | Update exports |

### Deleted

| File | Reason |
|------|--------|
| `ai-chat/components/AIAgentChat.tsx` | Standalone page, replaced by embedded AISection |
| `ai-chat/components/AIAgentPanel.tsx` | Entirely demo |
| `ai-chat/components/AgentSidebar.tsx` | Replaced by persona pills |
| `ai-chat/components/MobileAgentSheet.tsx` | Replaced by persona pills |
| `ai-chat/components/ChatHeader.tsx` | Page-level header, not needed inline |
| `ai-chat/components/PersonaCard.tsx` | Replaced by pill buttons |
| Routes: `/legacy/:legacyId/ai-chat` | No longer needed |
| Routes: `/legacy/:legacyId/ai-panel` | No longer needed |

## Data Flow

All existing data flow is preserved — the change is purely in the rendering layer.

1. **Tab activation:** AISection mounts → `usePersonas()` fetches personas → filtered to biographer/friend → defaults to biographer → `useAIChat` initializes conversation
2. **Persona switch:** Click pill → update state → `useAIChat` re-initializes with new persona
3. **New Chat:** `startNewConversation()` → clears messages, fresh conversation ID
4. **History:** `useConversationList` populates dropdown → click to switch conversation
5. **Messaging:** POST + SSE streaming, chunks appended via Zustand store (identical to current)
6. **Tab re-entry:** Zustand store persists across tab switches, conversation resumes

## Approach

Approach A: Refactor AISection to embed chat directly. Reuse all existing chat sub-components and hooks. Delete standalone pages, routes, and demo code.
