# Graph Model Expansion Design

**Date:** 2026-03-14
**Status:** Approved

## Context

The Neptune graph database currently has 4 node types (Story, Place, Event, Object) with 3 edge types (Story→REFERENCES→Event, Story→REFERENCES→Object, Story→TOOK_PLACE_AT→Place). Entity extraction identifies People from stories but `_sync_entities_to_graph()` skips them. Meanwhile, `legacy_members.profile` stores declared relationship types (parent, friend, coworker, etc.) that aren't represented in the graph.

This design expands the graph model to include Person nodes, Story-to-Person edges, and Person-to-Person relationship edges — enabling queries like "who are the coworkers of this legacy?", "what places are common across users?", and "which stories reference a given event?"

## Design Decisions

- **Single Person label** — Legacy subjects, Users, and extracted people all use the `:Person` label. Properties (`is_legacy`, `is_user`, `legacy_id`, `user_id`, `source`) distinguish origin. Keeps queries simple — no UNION across label types.
- **Category-based relationship edges** — Person-to-Person relationships use 4 edge labels (`FAMILY_OF`, `WORKED_WITH`, `FRIENDS_WITH`, `KNEW`) with a `relationship_type` property for specifics. Aligns with existing `GraphTraversalService` strategies.
- **Dual-path Person association** — Extracted persons connect to stories via edges AND carry a `legacy_id` property for direct filtering. Preserves provenance while enabling fast queries.
- **Differentiated Story-to-Person edges** — `WRITTEN_ABOUT` for primary subjects, `MENTIONS` for passing references, `AUTHORED_BY` for the story writer.
- **Both declared and extracted sources** — PostgreSQL `legacy_members.profile` relationship data (authoritative) augmented by entity-extracted relationships (discovery).

## Expanded Graph Schema

### Node Types

| Label | ID Format | Key Properties | Source |
|-------|-----------|---------------|--------|
| `Story` | UUID (story PK) | title, story_type, tags[], legacy_id, created_at | PostgreSQL |
| `Person` | UUID (person PK) or `person-{name}-{legacy_id}` | name, legacy_id, user_id?, is_legacy?, is_user?, source (`declared`/`extracted`) | PostgreSQL persons table OR entity extraction |
| `Place` | `place-{name}-{legacy_id}` | name, type, location | Entity extraction |
| `Event` | `event-{name}-{legacy_id}` | name, type, date | Entity extraction |
| `Object` | `object-{name}-{legacy_id}` | name, type, description | Entity extraction |

### Edge Types

#### Story-to-Entity Edges

| Edge | From | To | Properties | Meaning |
|------|------|----|-----------|---------|
| `WRITTEN_ABOUT` | Story | Person | confidence | Story's primary subject(s) |
| `MENTIONS` | Story | Person | confidence, context | Person appears but isn't the focus |
| `AUTHORED_BY` | Story | Person | — | The user who wrote the story |
| `TOOK_PLACE_AT` | Story | Place | confidence | *(existing)* |
| `REFERENCES` | Story | Event | confidence | *(existing)* |
| `REFERENCES` | Story | Object | confidence | *(existing)* |

#### Person-to-Person Edges

| Edge | Properties | Relationship Types |
|------|-----------|-------------------|
| `FAMILY_OF` | relationship_type, source | parent, child, spouse, sibling, grandparent, grandchild, aunt, uncle, cousin, niece, nephew, in_law |
| `WORKED_WITH` | relationship_type, source, company?, period? | colleague, mentor, mentee |
| `FRIENDS_WITH` | relationship_type, source, since?, context? | friend, neighbor |
| `KNEW` | relationship_type, source, context? | caregiver, acquaintance, other |

The `source` property is `declared` (from `legacy_members.profile`) or `extracted` (from story entity extraction).

## Query Patterns

### "Who are the coworkers of this legacy?"

```cypher
MATCH (legacy:Person {is_legacy: true, legacy_id: $legacy_id})
MATCH (legacy)-[:WORKED_WITH]-(coworker:Person)
RETURN coworker, "declared" AS source

UNION

MATCH (s:Story {legacy_id: $legacy_id})-[:MENTIONS|WRITTEN_ABOUT]->(p:Person)
MATCH (legacy:Person {is_legacy: true, legacy_id: $legacy_id})
WHERE p.id <> legacy.id
MATCH (legacy)-[:WORKED_WITH]-(p)
RETURN p AS coworker, "extracted" AS source
```

### "What places are common across users with respect to a legacy?"

```cypher
MATCH (s1:Story {legacy_id: $legacy_id})-[:TOOK_PLACE_AT]->(place:Place)
MATCH (s2:Story {legacy_id: $legacy_id})-[:TOOK_PLACE_AT]->(place)
WHERE s1.id <> s2.id
MATCH (s1)-[:AUTHORED_BY]->(a1:Person)
MATCH (s2)-[:AUTHORED_BY]->(a2:Person)
WHERE a1.id <> a2.id
RETURN place.name, place.type, COUNT(DISTINCT a1) + COUNT(DISTINCT a2) AS author_count
ORDER BY author_count DESC
```

### "Which stories reference a given event?"

```cypher
MATCH (s:Story)-[:REFERENCES]->(e:Event {name: $event_name, legacy_id: $legacy_id})
RETURN s.id, s.title, s.created_at
ORDER BY s.created_at
```

### "Show me stories written about this person"

```cypher
MATCH (s:Story)-[:WRITTEN_ABOUT]->(p:Person {id: $person_id})
RETURN s.id, s.title, s.created_at
ORDER BY s.created_at
```

### "Who are all the family members of this legacy?"

```cypher
MATCH (legacy:Person {is_legacy: true, legacy_id: $legacy_id})
MATCH (legacy)-[r:FAMILY_OF]-(family:Person)
RETURN family.name, r.relationship_type, r.source
```

### "What connects these two legacies?"

```cypher
MATCH (l1:Person {is_legacy: true, legacy_id: $legacy_id_1})
MATCH (l2:Person {is_legacy: true, legacy_id: $legacy_id_2})
MATCH path = shortestPath((l1)-[*..4]-(l2))
RETURN path
```

### GraphTraversalService Compatibility

The existing traversal strategies already reference `FAMILY_OF`, `KNEW`, `WORKED_WITH`, `FRIENDS_WITH` edge labels — these queries work with existing traversal code without changes to the strategy mapping.

## Sync Mechanisms

### 1. Story Entity Extraction → Graph (modify existing)

**Changes to `_sync_entities_to_graph()`:**

- For each extracted person, upsert a `Person` node with ID `person-{normalized_name}-{legacy_id}` and `legacy_id` property
- Classify as `WRITTEN_ABOUT` or `MENTIONS` using heuristic:
  - Person's name appears in story title → `WRITTEN_ABOUT`
  - Extraction confidence >= 0.9 and context suggests primary subject → `WRITTEN_ABOUT`
  - Otherwise → `MENTIONS`
- Create the appropriate Story→Person edge
- If extraction context implies a relationship (e.g., "uncle", "coworker"), create a Person→Person edge between the extracted person and the legacy subject's Person node, categorized into `FAMILY_OF` / `WORKED_WITH` / `FRIENDS_WITH` / `KNEW`

### 2. Member Profile → Graph (new sync)

**Trigger:** When a user updates `legacy_members.profile.relationship_type` via PUT `/api/legacies/{legacy_id}/profile`.

**Steps:**
1. Resolve or create a Person node for the user (keyed by `user_id`)
2. Resolve or create a Person node for the legacy subject (keyed by `legacy_id`, `is_legacy: true`)
3. Categorize the `relationship_type` into an edge label:
   - parent, child, spouse, sibling, grandparent, grandchild, aunt, uncle, cousin, niece, nephew, in_law → `FAMILY_OF`
   - colleague, mentor, mentee → `WORKED_WITH`
   - friend, neighbor → `FRIENDS_WITH`
   - caregiver, other → `KNEW`
4. Clear existing Person→Person edges for this user-legacy pair
5. Upsert the edge with `{relationship_type, source: "declared"}`

### 3. AUTHORED_BY Sync (new, during story ingestion)

During `_sync_entities_to_graph()`, after upserting the Story node:
1. Resolve or create a Person node for the story author (from `story.created_by` user_id)
2. Create `Story -[AUTHORED_BY]-> Person` edge

### 4. Person Deduplication

- Extracted persons use `person-{normalized_name}-{legacy_id}` as ID — same name across stories for the same legacy merges to the same node
- Same real person across different legacies creates different nodes (acceptable for now)
- Future: use PostgreSQL `Person` model (canonical_name, aliases) for cross-legacy deduplication

### 5. Backfill Scripts

- Update existing `backfill_entities.py` to create Person nodes, Story→Person edges, Person→Person edges from extraction context, and AUTHORED_BY edges
- New script to backfill declared relationships from existing `legacy_members.profile` data into Person→Person edges

## Scope

### In Scope

1. Add Person nodes to graph from entity extraction
2. Add `WRITTEN_ABOUT`, `MENTIONS`, `AUTHORED_BY` edges from stories to persons
3. Sync declared relationships from `legacy_members.profile` to Person→Person edges
4. Infer Person→Person edges from extraction context
5. Categorize all person relationships into `FAMILY_OF` / `WORKED_WITH` / `FRIENDS_WITH` / `KNEW`
6. Update backfill script to populate persons and relationships
7. New backfill script for declared member profile relationships

### Explicitly Deferred

- **Cross-legacy person deduplication** — Extracted persons scoped to a legacy. Merging across legacies requires canonical Person matching system.
- **LLM-based WRITTEN_ABOUT classification** — Start with heuristic. Upgrade to LLM if insufficient.
- **Bidirectional relationship inference** — User declaring "parent" of Legacy doesn't auto-create inverse "child" edge. Avoids incorrect assumptions.
- **Real-time graph sync via events** — Profile updates sync inline. Extract to async event-driven flow if latency becomes a problem.
- **Graph-powered UI features** — Data model and sync only. New UI surfaces are separate work.
- **Temporal edge queries** — Time periods exist as properties but no time-range query patterns yet.
