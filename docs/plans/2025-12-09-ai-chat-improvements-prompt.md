# AI Chat Improvements Implementation Prompt

> **For AI Coding Agent:** Implement these three features for the AI chat system.

---

## Key Implementation Considerations

Before implementing, be aware of these important technical details:

1. **Guardrail Trace Timing** (Feature 1): AWS Bedrock may send trace data in a **separate chunk** before the guardrail action chunk. Accumulate trace data across chunks rather than expecting it in a single chunk.

2. **Query Optimization** (Feature 2): The current `list_conversations()` runs N+2 queries. Refactor to use a single query with subqueries for message count and last_message_at.

3. **Database Session in Generator** (Feature 3): The `generate_stream()` function runs after `send_message()` returns. The `db` session from the outer scope may be stale. Use `mark_message_blocked()` with a fresh query by message ID, not by modifying a captured ORM object.

4. **Frontend State Management** (Feature 2): When adding `conversationId` to `useAIChat`, handle three cases: (a) specific ID provided → load it, (b) null/undefined → use get_or_create, (c) ID changes → switch conversations.

5. **Conversation Titles**: Currently NULL. Deferred to future enhancement - use fallback display "Chat from {date}" for now.

---

## Overview

This task involves three related improvements to the AI chat system:

1. **Enhanced Guardrail Tracing** - Capture and log detailed information when Bedrock guardrails block requests
2. **Multiple Conversations per Persona** - Allow users to start new chats and view chat history for each persona
3. **Guardrail-Blocked Message Exclusion** - Exclude messages that triggered guardrails from future context

---

## Current Architecture Summary

### Backend (FastAPI + SQLAlchemy)

**Models** (`services/core-api/app/models/ai.py`):
```python
class AIConversation(Base):
    __tablename__ = "ai_conversations"
    id: UUID
    user_id: UUID (FK users.id)
    legacy_id: UUID (FK legacies.id)
    persona_id: str  # e.g., "biographer", "friend"
    title: str | None
    created_at: datetime
    updated_at: datetime
    messages: relationship -> AIMessage[]

class AIMessage(Base):
    __tablename__ = "ai_messages"
    id: UUID
    conversation_id: UUID (FK ai_conversations.id)
    role: str  # "user" | "assistant"
    content: str
    token_count: int | None
    created_at: datetime
```

**Current Behavior** (`services/core-api/app/services/ai.py`):
- `get_or_create_conversation()` - Currently returns EXISTING conversation if one exists for user+legacy+persona combo (only ONE conversation per persona per legacy)
- `get_context_messages()` - Returns last 20 messages (MAX_CONTEXT_MESSAGES = 20) for context
- `list_conversations()` - Lists conversations filtered by legacy_id

**Bedrock Adapter** (`services/core-api/app/adapters/bedrock.py`):
- `stream_generate()` accepts `guardrail_id` and `guardrail_version` parameters
- When guardrail intervenes, raises `BedrockError("Your message was filtered for safety. Please rephrase.")`
- Currently does NOT capture trace details about which filter was triggered

**Guardrail Configuration** (`infra/cdk/lib/guardrail-construct.ts`):
- Content filters: HATE, VIOLENCE, SEXUAL, INSULTS, MISCONDUCT, PROMPT_ATTACK
- Each has configurable strength (LOW/MEDIUM/HIGH)

### Frontend (React + Zustand + TanStack Query)

**API Client** (`apps/web/src/lib/api/ai.ts`):
```typescript
interface Conversation { id, user_id, legacy_id, persona_id, title, created_at, updated_at }
interface ConversationSummary { id, legacy_id, persona_id, title, message_count, last_message_at, created_at }

createConversation(data: { legacy_id, persona_id }): Promise<Conversation>
listConversations(legacyId?: string): Promise<ConversationSummary[]>
deleteConversation(conversationId: string): Promise<void>
getMessages(conversationId, limit, offset): Promise<MessageListResponse>
streamMessage(conversationId, content, onChunk, onDone, onError): AbortController
```

**Store** (`apps/web/src/stores/aiChatStore.ts`):
- Uses Zustand with Map<conversationId, ConversationState>
- Manages messages, streaming state, errors per conversation

**Hook** (`apps/web/src/hooks/useAIChat.ts`):
- `useAIChat({ legacyId, personaId })` - Initializes conversation on mount
- Currently calls `createConversation` which returns existing conversation

**Component** (`apps/web/src/components/AIAgentChat.tsx`):
- Left sidebar: Persona selector (biographer, friend)
- Main area: Chat messages with input
- Currently NO UI for conversation history or starting new chats

---

## Feature 1: Enhanced Guardrail Tracing

### Goal
When Bedrock guardrails block a request, log detailed trace information including which specific filter(s) triggered the block.

### AWS Bedrock Trace Response Format
When `trace` is enabled, guardrail interventions include detailed assessment data:

```json
{
  "amazon-bedrock-guardrailAction": "INTERVENED",
  "amazon-bedrock-trace": {
    "guardrail": {
      "input": {
        "<guardrail-id>": {
          "contentPolicy": {
            "filters": [
              {
                "type": "HATE|VIOLENCE|SEXUAL|INSULTS|MISCONDUCT|PROMPT_ATTACK",
                "confidence": "LOW|MEDIUM|HIGH",
                "filterStrength": "LOW|MEDIUM|HIGH",
                "action": "BLOCKED"
              }
            ]
          },
          "topicPolicy": {
            "topics": [{ "name": "...", "type": "DENY", "action": "BLOCKED" }]
          },
          "invocationMetrics": {
            "guardrailProcessingLatency": 123,
            "usage": { "contentPolicyUnits": 1, ... }
          }
        }
      }
    }
  }
}
```

### Implementation

**File: `services/core-api/app/adapters/bedrock.py`**

1. Add `trace` parameter to enable guardrail tracing:
```python
invoke_params = {
    "modelId": model_id,
    "contentType": "application/json",
    "accept": "application/json",
    "body": json.dumps(request_body),
}

if guardrail_id and guardrail_version:
    invoke_params["guardrailIdentifier"] = guardrail_id
    invoke_params["guardrailVersion"] = guardrail_version
    invoke_params["trace"] = "ENABLED"  # <-- ADD THIS
```

2. **Important**: Trace data may arrive in a **separate chunk** before or after the guardrail action chunk. Accumulate trace data across chunks:

```python
# Add at start of stream processing loop (before async for event in event_stream)
guardrail_trace_data: dict[str, Any] = {}

# Inside the loop, add handler for trace chunks:
elif chunk_type == "amazon-bedrock-trace":
    # Accumulate trace data - may arrive before guardrailAction
    trace_content = chunk.get("trace", {})
    if "guardrail" in trace_content:
        guardrail_trace_data = trace_content["guardrail"]

elif chunk_type == "amazon-bedrock-guardrailAction":
    action = chunk.get("action")
    if action == "INTERVENED":
        # Use accumulated trace data (trace may have arrived in previous chunk)
        # Also check if trace is embedded in this chunk (some API versions)
        if not guardrail_trace_data:
            trace_data = chunk.get("amazon-bedrock-trace", {})
            guardrail_trace_data = trace_data.get("guardrail", {})

        # Extract which filters triggered
        triggered_filters = _extract_triggered_filters(guardrail_trace_data)

        logger.warning(
            "bedrock.guardrail_intervened",
            extra={
                "guardrail_id": guardrail_id,
                "chunk_count": chunk_count,
                "triggered_filters": triggered_filters,
                "trace": guardrail_trace_data,
            },
        )
        span.set_attribute("guardrail_intervened", True)
        span.set_attribute("guardrail_filters", str(triggered_filters))
        raise BedrockError(
            "Your message was filtered for safety. Please rephrase.",
            retryable=False,
        )
```

3. Add helper function to extract triggered filters:
```python
def _extract_triggered_filters(guardrail_trace: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract list of triggered filters from guardrail trace data."""
    triggered_filters = []
    input_assessment = guardrail_trace.get("input", {})

    for assessment in input_assessment.values():
        if "contentPolicy" in assessment:
            for f in assessment["contentPolicy"].get("filters", []):
                if f.get("action") == "BLOCKED":
                    triggered_filters.append({
                        "type": f.get("type"),
                        "confidence": f.get("confidence"),
                    })
        if "topicPolicy" in assessment:
            for t in assessment["topicPolicy"].get("topics", []):
                if t.get("action") == "BLOCKED":
                    triggered_filters.append({
                        "type": "TOPIC",
                        "name": t.get("name"),
                    })

    return triggered_filters
```

---

## Feature 2: Multiple Conversations per Persona (Chat History)

### Goal
Allow users to:
1. Start a **new conversation** with a persona (instead of always resuming the same one)
2. View a **list of recent conversations** for the selected persona (last 10, newest first)
3. Switch between conversations

### Database Changes
No schema changes needed - the existing schema already supports multiple conversations per user+legacy+persona.

### Query Optimization Note

The current `list_conversations()` implementation runs N+2 queries (1 for conversations, then 2 per conversation for count and last_message). This should be optimized to use a single query with subqueries:

```python
# In list_conversations(), use subqueries for efficiency:
from sqlalchemy import func, select
from sqlalchemy.orm import aliased

# Subquery for message count
msg_count_subq = (
    select(
        AIMessage.conversation_id,
        func.count(AIMessage.id).label("message_count"),
        func.max(AIMessage.created_at).label("last_message_at"),
    )
    .group_by(AIMessage.conversation_id)
    .subquery()
)

# Main query with join
query = (
    select(
        AIConversation,
        func.coalesce(msg_count_subq.c.message_count, 0).label("message_count"),
        msg_count_subq.c.last_message_at,
    )
    .outerjoin(msg_count_subq, AIConversation.id == msg_count_subq.c.conversation_id)
    .where(AIConversation.user_id == user_id)
)
# ... apply filters and return
```

### Backend Changes

**File: `services/core-api/app/routes/ai.py`**

1. Add new endpoint to create a NEW conversation (distinct from get_or_create):
```python
@router.post(
    "/conversations/new",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new conversation",
    description="Always creates a new conversation, even if one exists for this legacy/persona.",
)
async def create_new_conversation(
    data: ConversationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConversationResponse:
    """Create a new conversation (always new, never returns existing)."""
    session = require_auth(request)
    return await ai_service.create_conversation(
        db=db,
        user_id=session.user_id,
        data=data,
    )
```

**File: `services/core-api/app/services/ai.py`**

2. Add `create_conversation()` function (always creates new):
```python
async def create_conversation(
    db: AsyncSession,
    user_id: UUID,
    data: ConversationCreate,
) -> ConversationResponse:
    """Create a new conversation (always new).
    
    Unlike get_or_create_conversation, this always creates a new conversation.
    """
    # Check access
    await check_legacy_access(db, user_id, data.legacy_id)
    
    # Validate persona
    from ..config.personas import get_persona
    if not get_persona(data.persona_id):
        raise HTTPException(status_code=400, detail="Invalid persona")
    
    # Create new conversation
    conversation = AIConversation(
        user_id=user_id,
        legacy_id=data.legacy_id,
        persona_id=data.persona_id,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    
    return ConversationResponse.model_validate(conversation)
```

3. Modify `list_conversations()` to support filtering by persona and limiting:
```python
async def list_conversations(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID | None = None,
    persona_id: str | None = None,  # <-- ADD
    limit: int = 10,  # <-- ADD
) -> list[ConversationSummary]:
    query = select(AIConversation).where(AIConversation.user_id == user_id)
    
    if legacy_id:
        query = query.where(AIConversation.legacy_id == legacy_id)
    if persona_id:
        query = query.where(AIConversation.persona_id == persona_id)
    
    query = query.order_by(AIConversation.updated_at.desc()).limit(limit)
    # ... rest of implementation
```

4. Update route to accept new parameters:
```python
@router.get("/conversations")
async def list_conversations(
    request: Request,
    legacy_id: UUID | None = Query(None),
    persona_id: str | None = Query(None),  # <-- ADD
    limit: int = Query(10, ge=1, le=50),  # <-- ADD
    db: AsyncSession = Depends(get_db),
) -> list[ConversationSummary]:
```

### Frontend Changes

**File: `apps/web/src/lib/api/ai.ts`**

1. Add API function for creating new conversation:
```typescript
export async function createNewConversation(
  data: CreateConversationInput
): Promise<Conversation> {
  return apiPost<Conversation>('/api/ai/conversations/new', data);
}
```

2. Update `listConversations` to support persona filtering:
```typescript
export async function listConversations(
  legacyId?: string,
  personaId?: string,
  limit: number = 10
): Promise<ConversationSummary[]> {
  const params = new URLSearchParams();
  if (legacyId) params.append('legacy_id', legacyId);
  if (personaId) params.append('persona_id', personaId);
  params.append('limit', String(limit));
  return apiGet<ConversationSummary[]>(`/api/ai/conversations?${params}`);
}
```

**File: `apps/web/src/hooks/useAIChat.ts`**

3. Add query key for conversation list and the hook:
```typescript
// Add to aiChatKeys
export const aiChatKeys = {
  // ... existing keys ...
  conversationList: (legacyId: string, personaId: string) =>
    [...aiChatKeys.all, 'list', legacyId, personaId] as const,
};

export function useConversationList(legacyId: string, personaId: string) {
  return useQuery({
    queryKey: aiChatKeys.conversationList(legacyId, personaId),
    queryFn: () => listConversations(legacyId, personaId, 10),
    staleTime: 1000 * 30, // 30 seconds
  });
}
```

4. Modify `useAIChat` to accept optional `conversationId`:
```typescript
interface UseAIChatOptions {
  legacyId: string;
  personaId: string;
  conversationId?: string | null;  // <-- ADD: If provided, load this conversation instead of creating
}
```

5. **Important**: Update `useEffect` initialization to handle `conversationId` changes:
```typescript
// The initialization effect should handle three cases:
// 1. conversationId is provided -> load that specific conversation
// 2. conversationId is null/undefined -> use get_or_create behavior (existing)
// 3. conversationId changes -> switch to the new conversation

useEffect(() => {
  let mounted = true;

  async function initConversation() {
    // If a specific conversationId is provided, load it directly
    if (conversationId) {
      setConversationLoading(conversationId, true);
      setActiveConversation(conversationId);

      try {
        const { messages: existingMessages } = await getMessages(conversationId);
        if (!mounted) return;

        setMessages(conversationId, existingMessages);
        setConversationLoading(conversationId, false);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load conversation:', err);
        setError('Failed to load conversation. Please try again.');
        setConversationLoading(conversationId, false);
      }
      return;
    }

    // Otherwise, use existing get_or_create behavior
    // ... existing initialization code ...
  }

  initConversation();

  return () => {
    mounted = false;
    abortControllerRef.current?.abort();
  };
}, [legacyId, personaId, conversationId, /* ... other deps ... */]);
```

6. Add function to start new conversation:
```typescript
// In useAIChat return
startNewConversation: async () => {
  const conversation = await createNewConversation({ legacy_id: legacyId, persona_id: personaId });
  setConversation(conversation.id, conversation);
  setActiveConversation(conversation.id);
  // Clear messages for this new conversation
  setMessages(conversation.id, []);
  // Invalidate the conversation list to show the new conversation
  queryClient.invalidateQueries({ queryKey: aiChatKeys.conversationList(legacyId, personaId) });
  // Return the new conversation ID so the component can update its state
  return conversation.id;
}
```

**File: `apps/web/src/components/AIAgentChat.tsx`**

6. Add UI for chat history in the chat header area:
```tsx
// Add state
const [showHistory, setShowHistory] = useState(false);
const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

// Add query
const { data: conversationList } = useConversationList(legacyId, selectedPersonaId);

// Add to useAIChat options
const { ..., startNewConversation } = useAIChat({
  legacyId,
  personaId: selectedPersonaId,
  conversationId: selectedConversationId,
});
```

7. Add UI elements in the Chat Header area (right side):
```tsx
{/* In chat header, add these buttons */}
<div className="flex items-center gap-2 ml-auto">
  <Button
    variant="outline"
    size="sm"
    onClick={() => startNewConversation()}
    disabled={isStreaming}
  >
    <Plus className="size-4 mr-1" />
    New Chat
  </Button>
  
  <Popover open={showHistory} onOpenChange={setShowHistory}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm">
        <History className="size-4 mr-1" />
        History
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-80" align="end">
      <div className="space-y-2">
        <h4 className="font-medium">Recent Conversations</h4>
        {conversationList?.length === 0 && (
          <p className="text-sm text-neutral-500">No previous conversations</p>
        )}
        {conversationList?.map((conv) => (
          <button
            key={conv.id}
            onClick={() => {
              setSelectedConversationId(conv.id);
              setShowHistory(false);
            }}
            className={cn(
              "w-full text-left p-2 rounded hover:bg-neutral-100",
              selectedConversationId === conv.id && "bg-amber-50"
            )}
          >
            <p className="text-sm font-medium truncate">
              {conv.title || `Chat from ${formatDate(conv.created_at)}`}
            </p>
            <p className="text-xs text-neutral-500">
              {conv.message_count} messages · {formatRelativeTime(conv.last_message_at)}
            </p>
          </button>
        ))}
      </div>
    </PopoverContent>
  </Popover>
</div>
```

8. Import required components:
```tsx
import { Plus, History } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
```

---

## Feature 3: Exclude Guardrail-Blocked Messages from Context

### Goal
When a message triggers a guardrail block, mark it so it's excluded from future context. This prevents one offensive message from poisoning the entire conversation.

### Database Changes

**File: `services/core-api/app/models/ai.py`**

1. Add `blocked` flag to AIMessage:
```python
class AIMessage(Base):
    # ... existing fields ...
    
    blocked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default="false",
    )
```

2. Create migration:
```bash
cd services/core-api
alembic revision -m "add_blocked_to_ai_messages"
```

Migration content:
```python
def upgrade():
    op.add_column('ai_messages', sa.Column('blocked', sa.Boolean(), nullable=False, server_default='false'))

    # Add partial index for efficient context message queries (excludes blocked messages)
    op.create_index(
        'idx_ai_messages_context_lookup',
        'ai_messages',
        ['conversation_id', 'created_at'],
        postgresql_where=sa.text('blocked = false'),
    )

def downgrade():
    op.drop_index('idx_ai_messages_context_lookup', table_name='ai_messages')
    op.drop_column('ai_messages', 'blocked')
```

**Note**: The partial index `idx_ai_messages_context_lookup` optimizes the `get_context_messages()` query which filters by `blocked = False` and orders by `created_at DESC`.

### Backend Changes

**File: `services/core-api/app/services/ai.py`**

1. Update `get_context_messages()` to exclude blocked messages:
```python
async def get_context_messages(
    db: AsyncSession,
    conversation_id: UUID,
) -> list[dict[str, str]]:
    result = await db.execute(
        select(AIMessage)
        .where(
            AIMessage.conversation_id == conversation_id,
            AIMessage.blocked == False,  # <-- ADD: Exclude blocked messages
        )
        .order_by(AIMessage.created_at.desc())
        .limit(MAX_CONTEXT_MESSAGES)
    )
    messages = list(reversed(result.scalars().all()))
    
    return [
        {"role": m.role, "content": m.content}
        for m in messages
        if m.content and m.content.strip()
    ]
```

2. Update `save_message()` to accept `blocked` parameter:
```python
async def save_message(
    db: AsyncSession,
    conversation_id: UUID,
    role: str,
    content: str,
    token_count: int | None = None,
    blocked: bool = False,  # <-- ADD
) -> AIMessage:
    message = AIMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        token_count=token_count,
        blocked=blocked,  # <-- ADD
    )
    # ... rest unchanged
```

**File: `services/core-api/app/routes/ai.py`**

3. Mark the user message as blocked when guardrail intervenes.

**Important**: The `generate_stream()` inner function is a generator that runs after the outer function returns `StreamingResponse`. The `db` session from the outer scope may be in an inconsistent state by the time an error is caught. Use `mark_message_blocked()` with a fresh query by message ID:

```python
@router.post("/conversations/{conversation_id}/messages", ...)
async def send_message(...) -> StreamingResponse:
    # ... existing setup code ...

    # Save user message BEFORE streaming starts, capture its ID
    user_message = await ai_service.save_message(
        db=db,
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    user_message_id = user_message.id  # Capture ID as a simple value

    # Get context messages
    context = await ai_service.get_context_messages(db, conversation_id)

    async def generate_stream() -> AsyncGenerator[str, None]:
        adapter = get_bedrock_adapter()
        full_response = ""
        token_count: int | None = None

        try:
            settings = get_settings()
            async for chunk in adapter.stream_generate(...):
                full_response += chunk
                yield f"data: {SSEChunkEvent(content=chunk).model_dump_json()}\n\n"

            # Success - save assistant message
            message = await ai_service.save_message(
                db=db,
                conversation_id=conversation_id,
                role="assistant",
                content=full_response,
                token_count=token_count,
            )
            yield f"data: {SSEDoneEvent(...).model_dump_json()}\n\n"

        except BedrockError as e:
            logger.warning("ai.chat.error", extra={...})

            # Mark user message as blocked if guardrail intervened
            if "filtered for safety" in e.message:
                await ai_service.mark_message_blocked(db, user_message_id)

            yield f"data: {SSEErrorEvent(message=e.message, retryable=e.retryable).model_dump_json()}\n\n"

    return StreamingResponse(generate_stream(), ...)
```

4. Add service function to mark message as blocked (uses fresh query by ID):
```python
async def mark_message_blocked(
    db: AsyncSession,
    message_id: UUID,
) -> None:
    """Mark a message as blocked by guardrail."""
    result = await db.execute(
        select(AIMessage).where(AIMessage.id == message_id)
    )
    message = result.scalar_one_or_none()
    if message:
        message.blocked = True
        await db.commit()
```

### Frontend Changes

**File: `apps/web/src/lib/api/ai.ts`**

1. Add `blocked` to Message interface:
```typescript
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  token_count: number | null;
  created_at: string;
  blocked: boolean;  // <-- ADD
}
```

**File: `apps/web/src/components/AIAgentChat.tsx`**

2. Optionally show visual indicator for blocked messages:
```tsx
{message.blocked && (
  <Badge variant="outline" className="text-xs text-red-500 border-red-200">
    <ShieldAlert className="size-3 mr-1" />
    Excluded from context
  </Badge>
)}
```

---

## Files to Modify Summary

### Backend
| File | Changes |
|------|---------|
| `services/core-api/app/models/ai.py` | Add `blocked` column to AIMessage |
| `services/core-api/app/adapters/bedrock.py` | Enable trace, parse guardrail details |
| `services/core-api/app/services/ai.py` | Add `create_conversation()`, update `get_context_messages()` to exclude blocked, add `mark_message_blocked()`, update `list_conversations()` params |
| `services/core-api/app/routes/ai.py` | Add `/conversations/new` endpoint, update list params, mark messages blocked on guardrail error |
| `services/core-api/app/schemas/ai.py` | Add `blocked` to MessageResponse |

### Frontend
| File | Changes |
|------|---------|
| `apps/web/src/lib/api/ai.ts` | Add `createNewConversation()`, update `listConversations()` params, add `blocked` to Message |
| `apps/web/src/hooks/useAIChat.ts` | Add `useConversationList()`, add `conversationId` option, add `startNewConversation()` |
| `apps/web/src/stores/aiChatStore.ts` | May need minor updates to handle conversation switching |
| `apps/web/src/components/AIAgentChat.tsx` | Add "New Chat" button, add History popover, show blocked indicator |

### Database Migration
- Create Alembic migration to add `blocked` column to `ai_messages` table

---

## Future Enhancement: Conversation Titles

Currently, conversation titles are `NULL`, which results in generic display like "Chat from Dec 9" in the history popover. Consider auto-generating titles in a future iteration:

**Option A: First user message (simple)**
```python
# When creating conversation, if first message is sent:
if not conversation.title and role == "user":
    conversation.title = content[:50] + ("..." if len(content) > 50 else "")
```

**Option B: AI-generated summary (better UX, more cost)**
- After the first exchange, call LLM to generate a 3-5 word title
- Could be done async/background to avoid latency

This is **deferred** to keep scope manageable. The current fallback (`Chat from {date}`) is acceptable for MVP.

---

## Testing Checklist

- [ ] Guardrail intervention logs include `triggered_filters` with filter type and confidence
- [ ] Trace data is captured even when it arrives in a separate chunk
- [ ] "New Chat" button creates a fresh conversation
- [ ] History popover shows last 10 conversations for current persona (newest first)
- [ ] Clicking a history item loads that conversation
- [ ] Conversation list query is optimized (single query, not N+2)
- [ ] When guardrail blocks a message, that message is marked as blocked
- [ ] Blocked messages are excluded from context sent to Bedrock
- [ ] Blocked messages show visual indicator in UI
- [ ] Switching conversations via history correctly loads messages
- [ ] Starting new conversation invalidates the conversation list cache
- [ ] Existing functionality (streaming, retry, persona switching) still works

---

## Validation Commands

```bash
# Backend validation
cd /apps/mosaic-life && just validate-backend

# Run backend tests
cd /apps/mosaic-life && docker compose exec core-api uv run pytest -v

# Frontend validation  
cd /apps/mosaic-life/apps/web && pnpm lint && pnpm typecheck
```
