# Graph-Augmented RAG Documentation Design

**Goal:** Document the completed Graph-Augmented RAG implementation for both end users and developers/operators.

**Approach:** Feature-centric pages — each page serves one audience and one purpose.

---

## Deliverables

| # | Page | File | Audience | Location |
|---|------|------|----------|----------|
| 1 | AI Personas & Smart Connections | `apps/docs/docs/user-guide/ai-personas.md` | End users | MkDocs User Guide |
| 2 | Graph-Augmented RAG Architecture | `apps/docs/docs/developer-guide/graph-augmented-rag.md` | Developers | MkDocs Developer Guide |
| 3 | Graph RAG Configuration & Operations | `apps/docs/docs/developer-guide/graph-rag-configuration.md` | Admins/Operators | MkDocs Developer Guide |
| 4 | Graph-Augmented RAG Overview | `docs/architecture/GRAPH-AUGMENTED-RAG.md` | Repo browsers | Repo-level docs |

Additionally, update `apps/docs/mkdocs.yml` to add the three new MkDocs pages to the nav.

---

## Page 1: AI Personas & Smart Connections

**File:** `apps/docs/docs/user-guide/ai-personas.md`
**Audience:** Non-technical end users
**Tone:** Warm, approachable, no jargon

### Sections

1. **Introduction** (~3 sentences) — What AI personas are and why they exist. "When you have a conversation about your loved one, our AI personas draw on everything you've shared to provide meaningful, connected responses."

2. **Meet the Personas** — Table with each persona (Biographer, Friend, Colleague, Family Member): icon, focus area, what kind of conversations they're best for.

3. **How Smart Connections Work** (~1 paragraph) — Plain-language explanation that the system discovers connections between stories, people, places, and events. "When you mention Uncle Jim's trip to Chicago, the system can surface related stories about other family trips or other memories involving Uncle Jim."

4. **What to Expect** — Bullet list of what users will notice: related stories in conversations, personas suggesting exploration directions, connections across different family members' stories.

5. **Tips for Better Conversations** — Practical tips: share specific details, mention names and places, try different personas for different angles.

---

## Page 2: Graph-Augmented RAG Architecture

**File:** `apps/docs/docs/developer-guide/graph-augmented-rag.md`
**Audience:** Developers working on or extending the codebase
**Tone:** Technical but concise

### Sections

1. **Overview** (~1 paragraph) — What graph-augmented RAG is and why it was added. Links to the full design doc at `docs/plans/2026-02-26-graph-augmented-rag-design.md`.

2. **Processing Pipeline** — Mermaid sequence diagram showing: `prepare_turn()` → `GraphContextService.assemble_context()` → parallel intent analysis + embedding search → graph traversal → access filtering → merge/rank/deduplicate → token budget → formatted context. Brief prose for each step.

3. **Key Services** — Table: service class, file path, one-line purpose.
   - `GraphContextService` (orchestrator)
   - `IntentAnalyzer` (query classification)
   - `GraphTraversalService` (graph queries)
   - `GraphAccessFilter` (visibility enforcement)
   - `EntityExtractionService` (ingestion-time extraction)
   - `CircuitBreaker` (fault tolerance)

4. **Graph Adapters** — Adapter pattern explanation: `GraphAdapter` ABC → `LocalGraphAdapter` (TinkerPop/Gremlin) and `NeptuneGraphAdapter` (openCypher). Factory selects based on config. Mermaid class diagram.

5. **Persona Traversal Configuration** — How `TraversalConfig` shapes graph queries. Table showing 4 personas' traversal configs side by side: relationship weights, max hops, cross-legacy, temporal range.

6. **Circuit Breaker** — Mermaid state diagram (closed → open → half_open → closed). Thresholds and fallback behavior.

7. **Entity Extraction Pipeline** — Mermaid flowchart: story ingestion → LLM extraction → confidence filtering → graph sync. Backfill script mention.

8. **Observability** — Brief list of OTel spans, Prometheus metrics, debug mode query parameter. Links to design doc for full details.

9. **Further Reading** — Links to design doc and implementation plan.

---

## Page 3: Graph RAG Configuration & Operations

**File:** `apps/docs/docs/developer-guide/graph-rag-configuration.md`
**Audience:** Admins/operators deploying and tuning the system
**Tone:** Reference-style, practical, action-oriented

### Sections

1. **Overview** (~2 sentences) — What this page covers.

2. **Environment Variables** — Table: Variable, Default, Description. All Neptune, graph augmentation, and model ID settings.

3. **Local Development Setup** — Step-by-step: start Neptune via docker compose, verify connectivity, submit test query. Code blocks.

4. **Production Neptune Setup** — Neptune cluster requirements, IAM auth, env prefix for multi-environment isolation. Points to infrastructure repo.

5. **Persona Tuning** — Editing `personas.yaml`: `max_hops`, `relationship_weights`, `max_graph_results`, `include_cross_legacy`, `temporal_range`. What each knob does with practical examples.

6. **Entity Backfill** — Running the backfill script locally and via Kubernetes Job. Flags: `--dry-run`, `--limit`. Helm values toggle.

7. **Circuit Breaker Behavior** — Fallback behavior, recovery, monitoring via Prometheus.

8. **Disabling Graph Augmentation** — Single env var toggle, system falls back to embedding-only.

9. **Troubleshooting** — Problem/solution format: Neptune connectivity, high latency, empty extraction results, circuit breaker stuck open.

---

## Page 4: Graph-Augmented RAG Overview (Repo-Level)

**File:** `docs/architecture/GRAPH-AUGMENTED-RAG.md`
**Audience:** Developers browsing the repo on GitHub
**Tone:** Concise orientation, heavy on links

### Sections

1. **Overview** (~3 sentences) — What it is, when implemented, what it does.

2. **Architecture Summary** — One Mermaid diagram (high-level pipeline). Brief prose.

3. **Key Files** — Table: file path, purpose. All adapters, services, config, integration points, scripts.

4. **Configuration Quick Reference** — Compact env var table (no prose).

5. **Documentation Links** — Pointers to MkDocs pages, design doc, implementation plan.

---

## MkDocs Navigation Update

Update `apps/docs/mkdocs.yml` nav to include:

```yaml
- User Guide:
    - Creating Stories: user-guide/creating-stories.md
    - Sharing Memories: user-guide/sharing-memories.md
    - AI Personas & Smart Connections: user-guide/ai-personas.md
- Developer Guide:
    - Environment Setup: developer-guide/environment-setup.md
    - Local Setup: developer-guide/local-setup.md
    - Architecture: developer-guide/architecture.md
    - Graph-Augmented RAG: developer-guide/graph-augmented-rag.md
    - Graph RAG Configuration: developer-guide/graph-rag-configuration.md
    - Contributing: developer-guide/contributing.md
```

---

## Design Decisions

- **No duplication of design doc content** — Developer pages link to the design doc for deep details rather than reproducing them.
- **Mermaid diagrams** — Used for processing pipeline, adapter class hierarchy, circuit breaker states, and entity extraction flow. MkDocs already has Mermaid support enabled.
- **Repo-level doc is a landing page** — Short orientation that sends developers to the right detailed page.
- **Troubleshooting in the config page** — Operators need troubleshooting alongside configuration, not in a separate location.
