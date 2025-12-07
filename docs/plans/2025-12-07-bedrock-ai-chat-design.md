# Bedrock AI Chat Integration Design

**Date:** 2025-12-07
**Status:** Approved
**Phase:** 1 of 3

## Overview

Integrate AWS Bedrock-powered AI chat into the Mosaic Life memorial platform. Phase 1 delivers two AI personas (Biographer and Friend) with streaming chat, conversation persistence, and grief-aware safety rules.

## Decisions Summary

| Topic | Decision |
|-------|----------|
| Scope | Phase 1 only (Phases 2 & 3 captured below) |
| Personas | Biographer + Friend |
| Persistence | Database (conversations + messages) |
| Conversation scope | Per-legacy, per-persona |
| Response delivery | SSE streaming |
| Access control | Any legacy member |
| Safety rules | Shared base + persona-specific |
| Model config | Per-persona selection |
| Persona storage | YAML config file |
| Frontend | API layer + hooks + Zustand |
| Error handling | Display + preserve + retry button |
| Observability | OpenTelemetry spans |

---

## Phase 1: Core AI Chat

### Data Model

**`ai_conversations` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users |
| `legacy_id` | UUID | FK → legacies |
| `persona_id` | VARCHAR | References YAML config key |
| `title` | VARCHAR | Nullable, auto-generated or user-set |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**`ai_messages` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → ai_conversations |
| `role` | VARCHAR | "user" or "assistant" |
| `content` | TEXT | Message content |
| `token_count` | INTEGER | Nullable, for future cost tracking |
| `created_at` | TIMESTAMP | |

**Indexes:**
- `ai_conversations`: composite index on `(user_id, legacy_id, persona_id)`
- `ai_messages`: index on `(conversation_id, created_at)`

---

### Backend Architecture

**New files:**

```
services/core-api/
├── app/
│   ├── adapters/
│   │   └── bedrock.py          # BedrockAdapter - async streaming client
│   ├── config/
│   │   └── personas.yaml       # Persona definitions (prompts, models)
│   ├── models/
│   │   └── ai.py               # SQLAlchemy models
│   ├── routes/
│   │   └── ai.py               # /api/ai/* endpoints
│   ├── schemas/
│   │   └── ai.py               # Pydantic request/response schemas
│   └── services/
│       └── ai.py               # Business logic
├── alembic/versions/
│   └── xxxx_add_ai_tables.py   # Migration
```

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/personas` | List available personas (from YAML) |
| GET | `/api/ai/conversations` | List user's conversations (filterable by legacy_id) |
| POST | `/api/ai/conversations` | Create or get existing conversation |
| GET | `/api/ai/conversations/{id}/messages` | Get message history (paginated) |
| POST | `/api/ai/conversations/{id}/messages` | Send message, returns SSE stream |
| DELETE | `/api/ai/conversations/{id}` | Delete conversation |

**BedrockAdapter:**
- Async `stream_generate(messages, system_prompt, model_id)` → `AsyncGenerator[str, None]`
- Uses `bedrock-runtime` client with `InvokeModelWithResponseStreamAsync`
- Handles Bedrock-specific message formatting (Anthropic Messages API format)
- Wraps errors in domain exceptions

---

### Persona Configuration

**File: `services/core-api/app/config/personas.yaml`**

```yaml
# AI Persona Definitions

base_rules: |
  CRITICAL SAFETY RULES (apply to all responses):
  - You are assisting with a memorial/legacy site. Be grief-aware and respectful.
  - Never claim certainty about medical, legal, or financial matters.
  - Never impersonate the deceased or claim to be them.
  - Always acknowledge uncertainty: use phrases like "I may be mistaken" or "Based on what you've shared..."
  - Never speculate about cause of death or controversial circumstances.
  - If asked about topics outside your role, gently redirect to your purpose.

personas:
  biographer:
    name: "The Biographer"
    icon: "BookOpen"
    description: "Life Story Curator - helps organize memories into meaningful narratives"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    system_prompt: |
      You are The Biographer, a compassionate life story curator helping preserve memories of {legacy_name}.

      Your role:
      - Help users organize memories into themes and timelines
      - Ask clarifying questions to draw out rich details
      - Suggest connections between stories and life chapters
      - Help identify gaps in the narrative that could be filled

      Tone: Warm, curious, encouraging. Like a skilled interviewer writing a biography.

  friend:
    name: "The Friend"
    icon: "Heart"
    description: "Empathetic Listener - provides emotional support during the memorial process"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    system_prompt: |
      You are The Friend, a compassionate listener supporting someone preserving memories of {legacy_name}.

      Your role:
      - Acknowledge and validate emotions around grief and remembrance
      - Offer gentle prompts when someone seems stuck
      - Reflect feelings back to help users process
      - Celebrate joyful memories as much as honoring difficult ones

      Tone: Warm, gentle, patient. Like a trusted friend who listens without judgment.
```

**Runtime behavior:**
- Loaded once at startup, cached in memory
- `{legacy_name}` placeholder replaced at runtime
- `base_rules` prepended to each persona's `system_prompt`

---

### Frontend Architecture

**New files:**

```
apps/web/src/
├── lib/
│   └── api/
│       └── ai.ts               # SSE client for streaming chat
├── hooks/
│   └── useAIChat.ts            # Chat state management hook
├── stores/
│   └── aiChatStore.ts          # Zustand store for UI state
```

**SSE Client (`lib/api/ai.ts`):**
- `streamChat(conversationId, message)` → `AsyncGenerator<string>`
- Uses `fetch` with `text/event-stream` accept header
- Parses SSE `data:` events, yields content chunks
- Handles connection errors

**Zustand Store (`stores/aiChatStore.ts`):**

```typescript
interface AIChatState {
  conversations: Map<string, Conversation>
  activeConversationId: string | null
  isStreaming: boolean
  error: string | null

  setActiveConversation: (id: string) => void
  addMessage: (convId: string, message: Message) => void
  appendToLastMessage: (convId: string, chunk: string) => void
  setError: (error: string | null) => void
  setStreaming: (streaming: boolean) => void
}
```

**Hook (`hooks/useAIChat.ts`):**
- `sendMessage(content)` - initiates stream, updates store
- `retryLastMessage()` - re-sends failed message
- `loadConversation(legacyId, personaId)` - fetches or creates conversation
- Returns `{ messages, isStreaming, error, sendMessage, retryLastMessage }`

---

### SSE Streaming Flow

```
┌─────────────┐     POST /conversations/{id}/messages      ┌─────────────┐
│   Browser   │ ──────────────────────────────────────────▶│  Core API   │
│  (useAIChat)│    { content: "Tell me about..." }         │  (FastAPI)  │
└─────────────┘                                            └──────┬──────┘
       │                                                          │
       │                                            ┌─────────────▼─────────────┐
       │                                            │ 1. Validate access        │
       │                                            │ 2. Save user message      │
       │                                            │ 3. Load conversation      │
       │                                            │ 4. Build prompt context   │
       │                                            └───────────┬───────────────┘
       │                                                        │
       │                                            ┌───────────▼───────────────┐
       │                                            │   Bedrock Adapter         │
       │◀─────── SSE: data: {"chunk": "..."}  ─────│   InvokeModelWithStream   │
       │                                            └───────────┬───────────────┘
       │                                                        │
       │◀─────── SSE: data: {"done": true}  ───────────────────┘
       │                                            (Save assistant message)
```

**SSE event format:**

```
data: {"type": "chunk", "content": "I'd be happy to"}

data: {"type": "chunk", "content": " help you..."}

data: {"type": "done", "message_id": "uuid", "token_count": 142}

data: {"type": "error", "message": "Rate limit exceeded", "retryable": true}
```

**Conversation context:** Last 20 messages included for coherent conversation.

---

### OpenTelemetry Integration

| Span Name | Attributes |
|-----------|------------|
| `ai.chat.request` | `user_id`, `legacy_id`, `persona_id`, `conversation_id` |
| `ai.chat.context_load` | `message_count` |
| `ai.bedrock.stream` | `model_id`, `input_tokens` |
| `ai.chat.complete` | `output_tokens`, `latency_ms`, `success` |

---

### Error Handling

- Display user-friendly error message
- Preserve conversation state (never lose messages)
- Show "Retry" button on failed message
- No automatic retries in Phase 1

---

### Infrastructure Requirements

> **Note:** Infrastructure changes must be applied to the `mosaic-stories/infrastructure` repository.
> See the implementation plan (Task 13) for detailed steps.

**1. IAM Policy for Bedrock Access**

The EKS service account role needs the following policy to invoke Bedrock models:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

**Policy Details:**
- `bedrock:InvokeModel` - For synchronous requests (future use)
- `bedrock:InvokeModelWithResponseStream` - For streaming responses (Phase 1)
- Resource pattern `anthropic.claude-*` covers all Claude model variants (Sonnet, Haiku, Opus)
- Cross-region inference models use the `us.anthropic.claude-*` prefix in model IDs but the ARN remains as shown

**2. Environment Variable Configuration**

Add to Helm values (`infra/helm/core-api/values.yaml`):

```yaml
env:
  AWS_REGION: "us-east-1"
```

**3. Service Account IRSA Annotation**

The existing service account in `infra/helm/core-api/values.yaml` already has IRSA configured:

```yaml
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::033691785857:role/mosaic-prod-core-api-secrets-role
```

The Bedrock policy must be attached to this role (`mosaic-prod-core-api-secrets-role`).

---

## Phase 2: Bedrock Guardrails (Future)

**Not implemented in Phase 1. Captured for future work.**

- Create Bedrock Guardrail resource via CDK
- Configure denied topics:
  - Harassment or abuse toward deceased/family
  - Sensational claims about death circumstances
  - Impersonation of the deceased
- Configure content filters: profanity, hate speech, violence
- Apply `guardrail_id` to `InvokeModelWithResponseStream` calls
- Add UI "Report/Flag" button for incident logging
- Add `ai_incidents` table for flagged content review

**Migration path:** Add `guardrail_id` to persona config, update adapter call signature.

---

## Phase 3: Knowledge Base + RAG (Future)

**Not implemented in Phase 1. Captured for future work.**

- Create S3 bucket for vector store documents
- Create Bedrock Knowledge Base (one per legacy or shared with metadata filtering)
- Metadata schema:
  - `legacy_id` (partition key for filtering)
  - `persona_id`
  - `content_type` (story, media_caption, biography)
  - `curation_status` (draft, published, archived)
- Sync stories/media to S3 with metadata on create/update
- Update Bedrock adapter to use `RetrieveAndGenerate` API
- Add UI to show sources/citations from retrieved documents

**Migration path:** Add S3 sync service, update adapter to RAG mode, add citation rendering to frontend.

---

## Phase 1 Deliverables Checklist

### Backend

- [ ] Database migration: `ai_conversations`, `ai_messages` tables
- [ ] SQLAlchemy models: `AIConversation`, `AIMessage`
- [ ] Pydantic schemas: request/response for all endpoints
- [ ] `BedrockAdapter`: async streaming client with OTel spans
- [ ] `personas.yaml`: Biographer + Friend definitions
- [ ] AI service: conversation management, access control, context building
- [ ] AI routes: 6 endpoints with SSE streaming support
- [ ] Tests: pytest coverage for new functionality

### Frontend

- [ ] `lib/api/ai.ts`: SSE streaming client
- [ ] `stores/aiChatStore.ts`: Zustand store for chat state
- [ ] `hooks/useAIChat.ts`: Chat hook combining store + API
- [ ] Update `AIAgentChat.tsx`: replace mocks with real integration
- [ ] Error display with retry button
- [ ] Tests: Vitest coverage for hooks and components

### Infrastructure

- [ ] IAM policy for Bedrock access
- [ ] Environment variable configuration
- [ ] Validate backend with `just validate-backend`

---

## Not Included in Phase 1

- Bedrock Guardrails (Phase 2)
- Knowledge Base / RAG (Phase 3)
- Reporter and Digital Twin personas
- Admin UI for editing prompts
- Usage metrics / cost tracking dashboards
- Multiple concurrent conversations per legacy/persona
