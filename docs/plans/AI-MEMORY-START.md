# Mosaic Life - AI Knowledge Architecture

## Document Purpose

This document captures architectural decisions and feature requirements for extending Mosaic Life with AI-powered knowledge capabilities. It is designed to be used with Claude Code to incrementally implement features using the `superpowers:brainstorm` skill.

**Usage Pattern:** For each feature section, use this document as context when brainstorming implementation approaches. Claude Code should analyze the existing codebase structure and determine how to integrate each feature appropriately.

---

## Project Context

### Current Stack
- **Backend:** FastAPI (Python)
- **Frontend:** React with Next.js
- **Database:** PostgreSQL on RDS (single instance hosting prod, stage, grafana databases)
- **Infrastructure:** AWS EKS
- **AI Integration:** AWS Bedrock for LLM inference, Bedrock Guardrails for content safety

### Application Domain
Mosaic Life is a memorial platform that allows users to:
- Create "legacies" for people they want to memorialize
- Write and share stories about those people
- Upload media (photos, videos, documents)
- Interact with AI agent personas that help facilitate conversations about the memorialized person

### Permission Model
- **Legacies** have members with permission levels: Creator, Admin, Advocate, Admirer
- **Members** can be individual users or groups called "tribes"
- **Stories** have a minimum permission level required to view
- Access is determined by: `user_effective_permission >= story_min_permission_level`

### Architectural Principles
1. **Cloud-agnostic foundation** - Core capabilities should not depend on proprietary cloud services
2. **Selective cloud integration** - AWS services can be added when they provide clear value
3. **Experimentation support** - Architecture should allow A/B testing different AI providers and approaches
4. **Data sovereignty** - Users must have immediate, guaranteed control over their data (especially deletion)
5. **Memorial-appropriate safety** - All AI interactions must respect the sensitive nature of grief and remembrance

---

## Feature 1: Vector Store with pgvector

### Overview
Add vector storage capabilities to the existing PostgreSQL database using the pgvector extension. This enables semantic search over story content without introducing additional infrastructure.

### Expected Outcomes
- Stories can be chunked and embedded as vectors
- Semantic similarity search across story content
- Permission-filtered retrieval (only return chunks the user is authorized to see)
- Immediate, ACID-compliant deletion when stories are edited or removed

### Benefits
- No additional infrastructure to manage
- Single database for relational data and vectors
- Familiar PostgreSQL operational model
- Immediate consistency for data modifications
- Cost-effective (no separate vector database service)

### Key Design Decisions
- Use HNSW indexing for approximate nearest neighbor search
- Store vectors alongside story metadata in same transaction
- Permission level stored as integer for efficient filtering (Creator=0, Admin=1, Advocate=2, Admirer=3)
- Chunk-level granularity with story_id reference for cascade operations

### Technical Considerations
- RDS instance may need upgrade to support pgvector workload
- Embedding dimension depends on chosen model (1536 for OpenAI ada-002, 1024 for Titan, 3072 for text-embedding-3-large)
- HNSW index parameters (m, ef_construction) affect build time vs query performance tradeoff

### Documentation References
- pgvector GitHub: https://github.com/pgvector/pgvector
- pgvector on RDS: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL-Postgres-extensions.html#PostgreSQL.Concepts.General.FeatureSupport.Extensions.101x
- HNSW algorithm explanation: https://www.pinecone.io/learn/series/faiss/hnsw/
- Chunking strategies: https://www.pinecone.io/learn/chunking-strategies/

### Implementation Notes
- Check current RDS PostgreSQL version supports pgvector (requires PostgreSQL 11+)
- Consider separate schema for vector-related tables
- Plan for embedding model versioning (re-embedding if model changes)

---

## Feature 2: Story Ingestion Pipeline

### Overview
Asynchronous pipeline that processes stories when created or updated, generating embeddings and storing them in the vector store. Must handle the full lifecycle including updates and deletions.

### Expected Outcomes
- Stories are automatically vectorized after creation
- Story edits trigger re-vectorization of affected content
- Story deletions immediately remove all associated vectors
- Pipeline is resilient to failures with retry logic
- Audit trail of all vector operations

### Benefits
- Non-blocking user experience (story saves are fast)
- Reliable eventual consistency for vector store
- Clear data lineage for compliance
- Scalable processing for high-volume scenarios

### Key Design Decisions
- Event-driven architecture using message queue
- Idempotent processing (safe to retry)
- Deterministic vector key pattern: `story_{story_id}_chunk_{index}`
- Store chunk count in primary record for deletion enumeration

### Pipeline Flow
```
Story Created/Updated/Deleted
        │
        ▼
   Event Published (story_id, action, content_if_applicable)
        │
        ▼
   Message Queue (SQS or similar)
        │
        ▼
   Worker Process
        │
        ├─── CREATE: chunk → embed → store vectors
        │
        ├─── UPDATE: delete existing → chunk → embed → store new vectors
        │
        └─── DELETE: delete all vectors for story_id
        │
        ▼
   Update primary record (chunk_count, vectorized_at)
        │
        ▼
   Audit log entry
```

### Technical Considerations
- Chunking strategy: fixed size with overlap vs semantic chunking
- Embedding batching for cost efficiency
- Dead letter queue for failed processing
- Monitoring queue depth and processing latency

### Documentation References
- LangChain text splitters: https://python.langchain.com/docs/how_to/#text-splitters
- LlamaIndex node parsers: https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/
- Amazon Titan Embeddings: https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings

### Implementation Notes
- Consider using Celery, AWS Lambda, or background tasks in FastAPI
- Implement circuit breaker for embedding API calls
- Log embedding costs for budget monitoring

---

## Feature 3: Agent Framework Abstraction

### Implementation Status (2026-02-14)

**Status:** COMPLETE, including follow-on hardening tracked in the Feature 3 wrap-up plan.

**Implemented in codebase:**
- Protocol-based AI provider interfaces (`LLMProvider`, `EmbeddingProvider`) plus unified provider error envelope (`AIProviderError`)
- Configuration-driven provider selection via `AI_LLM_PROVIDER` and `AI_EMBEDDING_PROVIDER`
- Multiple provider implementations in active paths (AWS Bedrock + direct OpenAI)
- Business-path abstraction wiring for chat, retrieval, and ingestion (provider getters used in place of direct adapter coupling)

**Feature 3 wrap-up hardening completed (tracked in wrap-up plan):**
- DI/registry-expanded wiring includes vector store, memory, guardrail, and storytelling agent resolution
- Full protocol surface added (`VectorStore`, `AgentMemory`, `ContentGuardrail`, `StorytellingAgent`)
- Thin adapter shells implemented and integrated in active paths
- Shared provider contract conformance suite implemented and passing
- Provider-boundary observability normalization completed for supported providers

Reference: `docs/plans/2026-02-14-feature-3-agent-framework-wrap-up-plan.md`

### Overview
Create an abstraction layer that allows different AI agent implementations to be swapped without changing business logic. Supports experimentation with different LLM providers, frameworks, and approaches.

### Expected Outcomes
- Clean interface for agent interactions
- Multiple agent implementations can coexist
- A/B testing different approaches is straightforward
- New providers can be added without architectural changes
- Consistent observability regardless of implementation

### Benefits
- Avoid lock-in to any single AI provider or framework
- Compare quality and cost across providers
- Graceful fallback if a provider has issues
- Future-proof against rapid AI landscape changes

### Key Design Decisions
- Protocol-based interfaces (Python typing.Protocol)
- Separate concerns: LLM, vector store, memory, guardrails
- Configuration-driven provider selection
- Unified response format across implementations

### Abstraction Interfaces
```python
# Core abstractions to define

class VectorStore(Protocol):
    """Interface for vector storage backends"""
    async def upsert(self, vectors: list[Vector], metadata: dict) -> None
    async def delete(self, filter: dict) -> int
    async def search(self, query_vector: list[float], filter: dict, top_k: int) -> list[SearchResult]

class EmbeddingProvider(Protocol):
    """Interface for embedding generation"""
    async def embed(self, texts: list[str]) -> list[list[float]]
    @property
    def dimension(self) -> int

class LLMProvider(Protocol):
    """Interface for language model inference"""
    async def generate(self, messages: list[Message], **kwargs) -> LLMResponse
    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]

class AgentMemory(Protocol):
    """Interface for conversation and long-term memory"""
    async def get_context(self, session_id: str, query: str) -> MemoryContext
    async def store_interaction(self, session_id: str, interaction: Interaction) -> None

class ContentGuardrail(Protocol):
    """Interface for content safety validation"""
    async def validate_input(self, content: str, context: dict) -> ValidationResult
    async def validate_output(self, content: str, context: dict) -> ValidationResult

class StorytellingAgent(Protocol):
    """High-level interface for agent personas"""
    async def converse(self, message: str, context: ConversationContext) -> AgentResponse
    async def get_suggested_questions(self, context: ConversationContext) -> list[str]
```

### Technical Considerations
- Use dependency injection for swapping implementations
- Configuration via environment variables or feature flags
- Metrics collection at interface boundaries
- Error handling that doesn't leak implementation details

### Documentation References
- LangChain: https://python.langchain.com/docs/introduction/
- LlamaIndex: https://docs.llamaindex.ai/en/stable/
- LiteLLM (unified LLM interface): https://docs.litellm.ai/
- Instructor (structured outputs): https://python.useinstructor.com/

### Implementation Notes
- Start with LangChain for breadth of integrations
- Consider LiteLLM for provider abstraction at LLM layer
- Implement pgvector store first, add S3 Vectors implementation later if needed

---

## Feature 4: Permission-Filtered Knowledge Retrieval

### Overview
Integrate permission checking into the knowledge retrieval flow so that AI agents only have access to content the current user is authorized to see.

### Expected Outcomes
- Every retrieval query is filtered by user's effective permission level
- Users cannot prompt-inject their way to unauthorized content
- Permission changes take effect immediately
- Audit log of what content was retrieved for whom

### Benefits
- Security by design, not afterthought
- Consistent access control across UI and AI interactions
- Compliance with data access policies
- Trust that sensitive stories stay protected

### Key Design Decisions
- Permission resolution happens at application layer before retrieval
- Vector metadata includes min_permission_level (not user-specific ACLs)
- Filter construction is server-side, never client-controlled
- Double-check authorization after retrieval (defense in depth)

### Permission Resolution Flow
```
User initiates conversation about Legacy X
        │
        ▼
Application resolves effective permission:
  1. Check direct user → legacy membership
  2. Check user → tribe → legacy memberships  
  3. Take highest (most permissive) level granted
        │
        ▼
Construct retrieval filter:
  - legacy_id = X
  - min_permission_level >= user_effective_level
        │
        ▼
Execute filtered vector search
        │
        ▼
Post-retrieval validation (verify each chunk is accessible)
        │
        ▼
Return authorized chunks to agent
```

### Technical Considerations
- Cache permission resolution for session duration (invalidate on membership changes)
- Index on (legacy_id, min_permission_level) for efficient filtering
- Log retrieval queries for security audit
- Handle edge case: user loses permission mid-conversation

### Documentation References
- pgvector filtering: https://github.com/pgvector/pgvector#filtering
- LangChain retrievers with filtering: https://python.langchain.com/docs/how_to/self_query/

### Implementation Notes
- Permission resolution logic may already exist in codebase - reuse it
- Consider adding permission_level to conversation context passed to agents
- Test with scenarios: user in multiple tribes with different permissions

---

## Feature 5: Memorial-Appropriate Guardrails

### Overview
Configure content safety guardrails specifically designed for the memorial context. Prevent AI agents from asking inappropriate questions or generating unsuitable content while remaining helpful for preserving memories.

### Expected Outcomes
- Agents never ask about intimate, financial, or otherwise inappropriate topics
- Sensitive content in stories is handled respectfully
- Users feel safe sharing memories without fear of AI overreach
- Clear boundaries that align with memorial platform values

### Benefits
- Trust and safety for grieving users
- Brand protection for Mosaic Life
- Reduced moderation burden
- Consistent experience across all agent personas

### Key Design Decisions
- Defense in depth: prompt engineering + guardrails library + output filtering
- Topic-based blocking rather than just keyword filtering
- Context-aware (what's inappropriate for biographer may be fine for private journal)
- Graceful handling when guardrails trigger (redirect, not reject)

### Guardrail Categories

| Category | Blocked Topics | Rationale |
|----------|----------------|-----------|
| Intimate | Sexual history, romantic details beyond general relationships | Inappropriate for memorial context |
| Financial | Specific debts, account numbers, inheritance disputes | Privacy, potential for exploitation |
| Medical | Diagnoses, treatments, cause of death details | Privacy, potential for distress |
| Conflict | Family estrangements, legal disputes, accusations | Memorial should focus on positive legacy |
| Harmful | Self-harm, violence, substance abuse details | User wellbeing |

### Agent Persona Boundaries (Biographer Example)
```
Focus Areas (encourage):
- Life milestones and achievements
- Relationships and positive impact on others
- Hobbies, passions, sources of joy
- Funny stories and cherished memories
- Values and life lessons

Boundary Areas (redirect if raised):
- Intimate relationship details
- Financial specifics
- Medical conditions/treatments
- Family conflicts
- Legal troubles
```

### Technical Considerations
- Use guardrails-ai for Python-native validation
- Custom validators for memorial-specific rules
- Input validation (what user says) vs output validation (what agent says)
- Logging when guardrails trigger for quality improvement

### Documentation References
- guardrails-ai: https://www.guardrailsai.com/docs
- NeMo Guardrails: https://docs.nvidia.com/nemo/guardrails/
- Bedrock Guardrails: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html
- Constitutional AI principles: https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback

### Implementation Notes
- Start with prompt engineering in agent system prompts
- Add guardrails-ai validators for programmatic checks
- Keep Bedrock Guardrails as additional layer
- Create test suite of edge cases (user volunteers sensitive info, prompt injection attempts)

---

## Feature 6: Agent Personas

### Overview
Implement distinct AI agent personas that serve different purposes in the memorial experience. Each persona has unique characteristics, conversation styles, and objectives while sharing common infrastructure.

### Expected Outcomes
- Multiple specialized agents available to users
- Consistent quality and safety across all personas
- Personas feel distinct and purposeful
- Easy to add new personas without code changes

### Benefits
- Tailored experiences for different user needs
- Guided conversations that elicit meaningful stories
- Scalable approach to expanding AI capabilities
- Clear mental model for users (talking to "the biographer" vs generic AI)

### Initial Personas

| Persona | Purpose | Style | Primary Use Case |
|---------|---------|-------|------------------|
| **Biographer** | Elicit detailed life stories | Warm, curious, structured questions | Story collection |
| **Storyteller** | Generate narratives from collected stories | Creative, respectful, evocative | Content creation |
| **Companion** | Open-ended conversation about the person | Empathetic, reflective, supportive | Processing grief |
| **Archivist** | Help organize and categorize content | Methodical, helpful, detail-oriented | Content management |

### Persona Configuration Structure
```yaml
persona:
  id: biographer
  display_name: "The Biographer"
  description: "Helps you capture and preserve life stories"
  
  system_prompt: |
    You are a compassionate biographer helping preserve memories...
    [Full prompt with boundaries and focus areas]
  
  conversation_style:
    temperature: 0.7
    max_tokens: 1000
    response_format: conversational
  
  retrieval_config:
    top_k: 5
    rerank: true
    include_media_context: true
  
  capabilities:
    - story_retrieval
    - question_generation
    - summary_creation
  
  guardrail_profile: memorial_standard
```

### Technical Considerations
- Persona definitions as configuration, not code
- Shared retrieval and memory infrastructure
- Per-persona conversation history
- Metrics segmented by persona for quality analysis

### Documentation References
- LangChain agents: https://python.langchain.com/docs/how_to/#agents
- Prompt engineering guide: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
- Character consistency: https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/

### Implementation Notes
- Start with Biographer persona, expand based on user feedback
- Store persona selection in conversation context
- Consider persona "handoff" (biographer suggests talking to companion about emotions)

---

## Feature 7: Agent Memory System

### Overview
Implement memory capabilities that allow agents to maintain context within conversations and learn from interactions over time. Start with session memory, design for episodic memory expansion.

### Expected Outcomes
- Agents remember what was discussed earlier in conversation
- Key facts about the legacy are readily available
- Conversation summaries persist across sessions
- Foundation for more sophisticated memory (episodic) later

### Benefits
- Natural, continuous conversations
- No need to repeat context
- Agents can reference previous discussions
- Better user experience through personalization

### Memory Tiers

| Tier | Scope | Storage | Use Case |
|------|-------|---------|----------|
| **Working Memory** | Current conversation | In-memory / Redis | Recent turns, current topic |
| **Session Memory** | Single session | PostgreSQL | Conversation history, extracted facts |
| **Legacy Memory** | Per-legacy, persistent | PostgreSQL | Key facts, important stories, user preferences |
| **Episodic Memory** | Cross-session patterns | Future: AgentCore or custom | Learning from similar situations |

### Memory Schema (PostgreSQL)
```sql
-- Conversation sessions
CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY,
    legacy_id UUID NOT NULL,
    user_id UUID NOT NULL,
    persona_id VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    summary TEXT,  -- Generated summary of conversation
    metadata JSONB DEFAULT '{}'
);

-- Conversation turns
CREATE TABLE agent_turns (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES agent_sessions(id),
    role VARCHAR(20) NOT NULL,  -- user, assistant, system
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    token_count INTEGER,
    metadata JSONB DEFAULT '{}'
);

-- Extracted facts (legacy-level memory)
CREATE TABLE legacy_facts (
    id UUID PRIMARY KEY,
    legacy_id UUID NOT NULL,
    fact_type VARCHAR(50) NOT NULL,  -- birth_date, occupation, hobby, etc.
    fact_value TEXT NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    source_session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Technical Considerations
- Token budget management for context window
- Summarization for long conversations
- Fact extraction and deduplication
- Memory retrieval relevance (not just recency)

### Documentation References
- LangChain memory: https://python.langchain.com/docs/how_to/#memory
- LlamaIndex chat memory: https://docs.llamaindex.ai/en/stable/module_guides/deploying/chat_engines/
- Conversation summarization: https://python.langchain.com/docs/how_to/chatbots_memory/

### Implementation Notes
- Start with simple buffer memory (last N turns)
- Add summarization for conversations exceeding token limit
- Design fact extraction as optional enhancement
- Plan for AgentCore Memory integration when it proves valuable

---

## Feature 8: Observability and Monitoring

### Overview
Implement comprehensive observability for the AI knowledge system, covering performance metrics, quality indicators, cost tracking, and security auditing.

### Expected Outcomes
- Real-time visibility into system health
- Quality metrics for agent interactions
- Cost attribution and budget alerts
- Security audit trail for compliance
- Debugging capabilities for production issues

### Benefits
- Proactive issue detection
- Data-driven quality improvements
- Cost control and optimization
- Compliance and security assurance
- Faster incident resolution

### Metric Categories

| Category | Metrics | Purpose |
|----------|---------|---------|
| **Performance** | Query latency (p50/p95/p99), throughput, error rate | System health |
| **Quality** | Retrieval relevance, response helpfulness, guardrail trigger rate | User experience |
| **Cost** | Tokens used, embedding calls, LLM calls, cost per conversation | Budget management |
| **Security** | Permission check failures, unauthorized access attempts, data deletions | Compliance |
| **Usage** | Conversations per day, stories vectorized, personas used | Business metrics |

### Observability Stack
```
Application Code
      │
      ▼
OpenTelemetry SDK (traces, metrics, logs)
      │
      ├──► OTLP Exporter ──► CloudWatch (or Grafana Cloud, Datadog)
      │
      └──► Structured Logs ──► CloudWatch Logs (or ELK)
      
Dashboard: Grafana (existing) or CloudWatch Dashboards
Alerting: CloudWatch Alarms or Grafana Alerting
```

### Key Traces to Implement
```
conversation_request
├── permission_resolution (user_id, legacy_id, resolved_level)
├── knowledge_retrieval
│   ├── embedding_generation (tokens, latency, model)
│   ├── vector_search (query_filter, results_count, latency)
│   └── post_filter_validation (chunks_returned, chunks_filtered)
├── memory_retrieval (session_id, facts_retrieved)
├── guardrail_check_input (passed, triggered_rules)
├── llm_generation (model, tokens_in, tokens_out, latency)
├── guardrail_check_output (passed, triggered_rules)
└── response_delivered (total_latency)
```

### Technical Considerations
- Instrument at abstraction boundaries (interfaces defined in Feature 3)
- Sample traces in production (1-10% depending on volume)
- Aggregate metrics, don't log every request
- Redact PII from logs and traces

### Documentation References
- OpenTelemetry Python: https://opentelemetry.io/docs/languages/python/
- LangSmith (LangChain observability): https://docs.smith.langchain.com/
- LlamaIndex observability: https://docs.llamaindex.ai/en/stable/module_guides/observability/
- CloudWatch Container Insights: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html

### Implementation Notes
- You already have Grafana - leverage existing infrastructure
- Start with basic latency and error rate dashboards
- Add quality metrics once baseline is established
- Consider LangSmith for development/debugging, simpler solution for production

---

## Feature 9: Experimentation Framework

### Overview
Enable systematic experimentation with different AI providers, models, prompts, and configurations. Support A/B testing and gradual rollouts.

### Expected Outcomes
- Compare quality across different LLM providers
- Test prompt variations systematically
- Gradual rollout of changes with rollback capability
- Data-driven decisions on AI configuration

### Benefits
- Optimize for quality and cost
- Reduce risk of changes
- Learn what works for memorial context
- Stay current with rapidly evolving AI landscape

### Experiment Dimensions

| Dimension | Examples | Metrics to Compare |
|-----------|----------|-------------------|
| **LLM Provider** | Bedrock Claude, Anthropic direct, OpenAI | Quality, latency, cost |
| **Model Version** | Claude 3.5 vs 4, GPT-4 vs GPT-4o | Quality, latency, cost |
| **Prompt Variations** | Different system prompts, few-shot examples | Helpfulness, boundary adherence |
| **Retrieval Config** | top_k, reranking, chunking strategy | Relevance, completeness |
| **Temperature** | 0.5 vs 0.7 vs 0.9 | Creativity, consistency |

### Experiment Configuration
```yaml
experiment:
  id: prompt_v2_test
  description: "Testing revised biographer prompt with more explicit boundaries"
  
  allocation:
    type: percentage  # or user_list, legacy_list
    control: 90
    treatment: 10
  
  variants:
    control:
      prompt_version: v1
    treatment:
      prompt_version: v2
  
  metrics:
    primary: user_rating
    secondary:
      - guardrail_trigger_rate
      - conversation_length
      - stories_collected
  
  duration_days: 14
  min_samples: 100
```

### Technical Considerations
- Consistent assignment (same user gets same variant)
- Metrics collection tied to experiment variant
- Ability to stop experiment early if treatment is harmful
- Clear documentation of what changed

### Documentation References
- Feature flags patterns: https://martinfowler.com/articles/feature-toggles.html
- LaunchDarkly (if using managed): https://docs.launchdarkly.com/
- Statsig: https://docs.statsig.com/
- DIY approach: https://posthog.com/docs/experiments

### Implementation Notes
- Start simple: configuration-based variant selection
- Log experiment assignment with every interaction
- Build comparison dashboards before running experiments
- Consider user consent for experiments

---

## Feature 10: Story Edit and Delete Cascade

### Overview
Ensure that when stories are edited or deleted, all derived knowledge (vectors, cached embeddings, memory references) is updated or removed immediately and completely.

### Expected Outcomes
- Story edits trigger re-vectorization
- Story deletions remove all associated vectors immediately
- No orphaned data in vector store
- Audit trail of all cascade operations
- User confidence that "delete" means delete

### Benefits
- Data integrity across systems
- User trust and control
- GDPR/privacy compliance readiness
- Clean data for AI quality

### Critical Requirement: Immediate Deletion
For memorial content, users may be in emotional distress when requesting deletion. The system must:
1. Acknowledge deletion request immediately
2. Remove content from all retrievable locations
3. Confirm completion to user
4. Log for audit/compliance

### Cascade Operations

| Trigger | Actions | Timing |
|---------|---------|--------|
| **Story Created** | Chunk → Embed → Store vectors | Async (seconds) |
| **Story Edited** | Delete existing vectors → Re-chunk → Re-embed → Store new vectors | Async (seconds) |
| **Story Deleted** | Delete all vectors → Clear from memory/cache → Audit log | Sync (immediate) |
| **Legacy Deleted** | Delete all legacy vectors → Clear all sessions → Audit log | Sync (immediate) |

### Deletion Verification
```python
async def delete_story_knowledge(story_id: str, user_id: str) -> DeletionResult:
    """
    Delete all knowledge derived from a story.
    Must be immediate and verifiable.
    """
    # 1. Delete from vector store
    deleted_count = await vector_store.delete({"story_id": story_id})
    
    # 2. Invalidate any cached embeddings
    await cache.delete_pattern(f"embedding:{story_id}:*")
    
    # 3. Remove from any active memory contexts
    await memory_store.remove_references(story_id=story_id)
    
    # 4. Audit log
    await audit_log.record(
        action="story_knowledge_deleted",
        story_id=story_id,
        user_id=user_id,
        vectors_deleted=deleted_count,
        timestamp=utcnow()
    )
    
    # 5. Verify deletion
    remaining = await vector_store.search(filter={"story_id": story_id}, top_k=1)
    if remaining:
        raise DeletionVerificationError(f"Vectors still exist for story {story_id}")
    
    return DeletionResult(success=True, vectors_deleted=deleted_count)
```

### Technical Considerations
- Soft delete vs hard delete (consider both levels)
- Foreign key cascade for relational data
- Deterministic vector keys enable enumeration without search
- Transaction boundaries (what must be atomic?)

### Documentation References
- PostgreSQL cascading deletes: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK
- pgvector deletion: https://github.com/pgvector/pgvector#deleting-vectors

### Implementation Notes
- Story deletion may already exist - extend it, don't duplicate
- Consider "pending deletion" state during async processing
- Test cascade with stories that have many chunks
- Document recovery process (if any) for accidental deletions

---

## Implementation Sequence

### Phase 1: Foundation (Target: Friends & Family Preview)
1. **Feature 1: Vector Store with pgvector** - Database foundation
2. **Feature 2: Story Ingestion Pipeline** - Data flow
3. **Feature 4: Permission-Filtered Retrieval** - Security foundation
4. **Feature 10: Story Edit/Delete Cascade** - Data integrity

### Phase 2: Agent Experience (Target: February Launch)
5. **Feature 3: Agent Framework Abstraction** - Extensibility
6. **Feature 5: Memorial-Appropriate Guardrails** - Safety
7. **Feature 6: Agent Personas** - User experience (start with Biographer)
8. **Feature 7: Agent Memory System** - Conversation quality

### Phase 3: Operational Excellence (Post-Launch)
9. **Feature 8: Observability and Monitoring** - Visibility
10. **Feature 9: Experimentation Framework** - Optimization

---

## Cross-Cutting Concerns

### Security Checklist
- [ ] Permission checks at every retrieval
- [ ] No user-controllable filter construction
- [ ] Audit logging for sensitive operations
- [ ] PII handling in logs and traces
- [ ] Rate limiting on AI endpoints

### Performance Targets
- Vector search: < 100ms p95
- Full agent response: < 3s p95
- Story vectorization: < 30s async
- Deletion cascade: < 5s sync

### Cost Monitoring
- Track embedding API costs per story
- Track LLM costs per conversation
- Set budget alerts at 50%, 75%, 90%
- Review cost per user/legacy monthly

---

## Appendix: Quick Reference Links

### Vector Stores
- pgvector: https://github.com/pgvector/pgvector
- Qdrant: https://qdrant.tech/documentation/
- AWS S3 Vectors: https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html

### Agent Frameworks
- LangChain: https://python.langchain.com/docs/
- LlamaIndex: https://docs.llamaindex.ai/
- Strands Agents: https://strandsagents.com/

### LLM Providers
- AWS Bedrock: https://docs.aws.amazon.com/bedrock/
- Anthropic API: https://docs.anthropic.com/
- OpenAI API: https://platform.openai.com/docs/

### Guardrails
- guardrails-ai: https://www.guardrailsai.com/docs
- Bedrock Guardrails: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html

### Embeddings
- Amazon Titan: https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- Cohere Embed: https://docs.cohere.com/docs/embeddings

### Observability
- OpenTelemetry: https://opentelemetry.io/docs/
- LangSmith: https://docs.smith.langchain.com/