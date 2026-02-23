# Person Identity Resolution Layer — Phase 1 Design

**Date:** 2026-02-23
**Status:** Approved
**Scope:** Phase 1 — Person entity, identity matching, consent-based linking
**Deferred:** Legacy merging (Phase 2), Person as navigable entity (Phase 2)

---

## Problem Statement

The platform has no concept of a canonical person identity separate from a Legacy. This causes:

1. **Duplicate Legacies** — Multiple users independently create legacies for the same person with no way to connect them
2. **Lost Context** — Stories written by members of one legacy are invisible to members of another legacy about the same person
3. **No Discovery** — Users cannot find that someone else has created a legacy for a person they want to honor
4. **AI Fragmentation** — AI personas have incomplete context, limited to a single legacy's stories

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Person entity architecture | Separate `persons` table with `legacies.person_id` FK | Clean separation, stable ID for future graph (Neptune), natural many-to-one |
| Match UX | Hybrid: fast inline + deep async | Prevents duplicates without blocking creation flow |
| Shared content display | Integrated view with source indicator | Unified experience, not a separate tab |
| Merge support | Deferred to Phase 2 | Linking solves the core problem; merging adds significant complexity |
| Person navigability | System-managed now, first-class later | Data model supports future Person profile pages without frontend work now |
| Share granularity | Selective (per-story) or all, per-side | Flexible — privacy-conscious default with bulk option |

---

## Data Model

### New Tables

#### `persons`

Canonical identity for a real-world person.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, default uuid_generate_v4() | Stable ID, future graph node |
| `canonical_name` | VARCHAR(200) | NOT NULL | Best-known full name |
| `aliases` | JSONB | DEFAULT '[]' | Array of alternate names/nicknames |
| `birth_date` | DATE | NULLABLE | |
| `birth_date_approximate` | BOOLEAN | DEFAULT false | |
| `death_date` | DATE | NULLABLE | |
| `death_date_approximate` | BOOLEAN | DEFAULT false | |
| `locations` | JSONB | DEFAULT '[]' | Array of associated location strings |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
- GIN trigram on `canonical_name` (gin_trgm_ops) — for fuzzy name search
- GIN on `aliases` — for alias containment queries
- btree on `birth_date`
- btree on `death_date`

#### `legacy_links`

Consent-based connection between two legacies about the same Person.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `person_id` | UUID | FK → persons(id), NOT NULL | The shared Person |
| `requester_legacy_id` | UUID | FK → legacies(id) CASCADE, NOT NULL | Legacy that initiated |
| `target_legacy_id` | UUID | FK → legacies(id) CASCADE, NOT NULL | Legacy that received request |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending, active, rejected, revoked |
| `requester_share_mode` | VARCHAR(20) | NOT NULL, DEFAULT 'selective' | selective or all |
| `target_share_mode` | VARCHAR(20) | NOT NULL, DEFAULT 'selective' | selective or all |
| `requested_by` | UUID | FK → users(id), NOT NULL | User who initiated |
| `responded_by` | UUID | FK → users(id), NULLABLE | User who accepted/rejected |
| `requested_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `responded_at` | TIMESTAMPTZ | NULLABLE | |
| `revoked_at` | TIMESTAMPTZ | NULLABLE | |
| `revoked_by` | UUID | FK → users(id), NULLABLE | |

**Indexes:**
- btree on `person_id`
- btree on `requester_legacy_id`
- btree on `target_legacy_id`
- btree on `status`
- UNIQUE on `(requester_legacy_id, target_legacy_id)` — one link request per pair

**State Machine:**
```
[no link] → pending → active ⇄ revoked
                    ↘ rejected
```

#### `legacy_link_shares`

Per-story/media sharing permissions for an active link.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `legacy_link_id` | UUID | FK → legacy_links(id) CASCADE, NOT NULL | The active link |
| `source_legacy_id` | UUID | FK → legacies(id), NOT NULL | Which legacy is sharing |
| `resource_type` | VARCHAR(20) | NOT NULL | 'story' or 'media' |
| `resource_id` | UUID | NOT NULL | Story or Media ID |
| `shared_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `shared_by` | UUID | FK → users(id), NOT NULL | |

**Indexes:**
- btree on `legacy_link_id`
- UNIQUE on `(legacy_link_id, resource_type, resource_id)`

### Modified Tables

#### `legacies`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `person_id` | UUID | FK → persons(id), initially NULLABLE then NOT NULL | Added column |

**Index:** btree on `person_id`

---

## Identity Matching Service

### Hybrid Matching Flow

#### Inline (During Legacy Creation — Fast)

1. User enters name + optional dates in creation form
2. Frontend debounces (300ms) and calls `GET /api/persons/match-candidates`
3. Backend runs fast query against `persons` table:
   - Trigram similarity on `canonical_name` (threshold >= 0.3)
   - JSONB alias containment check
   - Date proximity filter (+-2 years if approximate, exact if not)
4. Returns top 5 candidates with confidence scores
5. Frontend shows candidates: "This may be the same person as a legacy someone else created"
6. User can: **Link to existing Person**, **Not the same person**, or **Create new** (default)

**Privacy constraint:** Match candidates reveal ONLY: canonical name, birth/death year ranges, number of linked legacies. Never legacy names, creators, or content.

#### Async (Post-Creation — Deep)

1. Background task runs deeper matching after legacy creation:
   - pgvector similarity on biography embeddings vs other Person descriptions
   - Location overlap scoring
2. If high-confidence match found (>= 0.8), send notification to legacy creator
3. Creator reviews and confirms/dismisses from notification action

### Confidence Scoring

| Signal | Weight | Method |
|--------|--------|--------|
| Name similarity | 0.4 | pg_trgm `similarity()` — already indexed on legacies, new index on persons |
| Alias match | 0.15 | JSONB `@>` containment check |
| Birth date proximity | 0.2 | Exact = 1.0, +-1yr = 0.7, +-2yr = 0.4, no date = 0.0 |
| Death date proximity | 0.15 | Same scoring as birth date |
| Location overlap | 0.1 | JSONB array intersection ratio |

Weighted sum produces confidence score 0.0–1.0.
- **Inline display threshold:** >= 0.5
- **Async notification threshold:** >= 0.8

---

## Legacy Linking Protocol

### Link Request Flow

1. **Prerequisite**: Both legacies reference the same `person_id` (via confirmed match)
2. **Initiate**: Creator/admin of Legacy A calls `POST /api/legacy-links/`
   - Validates both legacies share the same person_id
   - Validates requester has creator/admin role
   - Creates `legacy_links` record (status=pending)
   - Sends notification to creator(s) of target legacy
3. **Respond**: Target creator reviews and accepts/rejects
   - Accept → status=active, responded_at set
   - Reject → status=rejected, responded_at set (re-request allowed after 30 days)
4. **Share Content**: Either creator manages sharing via share endpoints
   - Selective mode: explicitly share individual stories/media
   - All mode: all content from that side automatically shared
5. **Revoke**: Either creator can revoke at any time
   - Status → revoked, shared content immediately inaccessible

### Share Modes (Per-Side)

Each side of a link independently controls their share mode:

- **`selective`** (default): Only explicitly shared stories/media are visible to the other side. Uses `legacy_link_shares` records.
- **`all`**: All stories/media from that legacy are automatically shared. No individual share records needed. Future stories are automatically included.

Switching from `all` to `selective` revokes all implicit sharing (confirmation required). Switching from `selective` to `all` makes everything shared (existing share records become redundant).

### Permission Model for Shared Content

- Members of the target legacy gain **read-only** access to shared stories
- Shared stories appear in the target legacy's story list with a "Shared from [Legacy Name]" indicator
- The source legacy's name is shown only if the source legacy is public; otherwise shows "Shared from another legacy"
- Target members cannot edit, version, or delete shared stories
- Original story visibility settings apply within the source legacy as before

### Access Control Query

Stories for a legacy now include linked shares:

```sql
-- Own stories
SELECT s.* FROM stories s
JOIN story_legacies sl ON sl.story_id = s.id
WHERE sl.legacy_id = :legacy_id AND s.visibility IN (:allowed_visibilities)

UNION

-- Shared stories (selective mode)
SELECT s.* FROM stories s
JOIN legacy_link_shares lls ON lls.resource_type = 'story' AND lls.resource_id = s.id
JOIN legacy_links ll ON ll.id = lls.legacy_link_id AND ll.status = 'active'
WHERE (ll.requester_legacy_id = :legacy_id OR ll.target_legacy_id = :legacy_id)
  AND lls.source_legacy_id != :legacy_id

UNION

-- Shared stories (all mode)
SELECT s.* FROM stories s
JOIN story_legacies sl ON sl.story_id = s.id
JOIN legacy_links ll ON ll.status = 'active'
  AND ((ll.requester_legacy_id = :legacy_id AND ll.target_legacy_id = sl.legacy_id AND ll.target_share_mode = 'all')
    OR (ll.target_legacy_id = :legacy_id AND ll.requester_legacy_id = sl.legacy_id AND ll.requester_share_mode = 'all'))
WHERE s.visibility IN ('public', 'private')  -- shared-all uses public+private, not personal
```

---

## API Endpoints

### Person Matching

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `GET /api/persons/match-candidates` | GET | Required | Find matching persons by name/dates/locations |

**Query params:** `name` (required), `birth_date`, `death_date`, `locations[]`

**Response:**
```json
{
  "candidates": [
    {
      "person_id": "uuid",
      "canonical_name": "John Smith",
      "birth_year_range": "1945-1947",
      "death_year_range": "2020",
      "legacy_count": 2,
      "confidence": 0.85
    }
  ]
}
```

### Legacy Links

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `POST /api/legacy-links/` | POST | Creator/Admin | Initiate link request |
| `GET /api/legacy-links/` | GET | Auth | List links for user's legacies |
| `GET /api/legacy-links/{id}` | GET | Auth | Get link details |
| `PATCH /api/legacy-links/{id}/respond` | PATCH | Creator/Admin (target) | Accept or reject |
| `PATCH /api/legacy-links/{id}/revoke` | PATCH | Creator/Admin (either) | Revoke active link |
| `PATCH /api/legacy-links/{id}/share-mode` | PATCH | Creator/Admin (own side) | Set selective or all |
| `POST /api/legacy-links/{id}/shares` | POST | Creator/Admin (source) | Share specific story/media |
| `DELETE /api/legacy-links/{id}/shares/{share_id}` | DELETE | Creator/Admin (source) | Unshare |
| `GET /api/legacy-links/{id}/shares` | GET | Auth (either side member) | List shared content |

### Legacy Creation (Modified)

`POST /api/legacies/` — Updated to accept optional `person_id`:
- If `person_id` provided: link legacy to existing Person (user confirmed match)
- If not provided: auto-create a new Person from legacy attributes

---

## AI Context Enhancement

### RAG Retrieval Changes

When retrieving context for an AI persona conversation:

1. Query own legacy's `story_chunks` as before (filtered by role-based visibility)
2. Find active linked legacies
3. For each linked legacy:
   - **Selective mode**: Include `story_chunks` where `story_id` in `legacy_link_shares`
   - **All mode**: Include all `story_chunks` from that legacy with `visibility IN ('public', 'private')`
4. Combine all chunks, rank by vector similarity to the query, return top-k

### Access Level for Shared Content in AI Context

Shared stories are treated as readable context regardless of their original visibility. The source creator explicitly chose to share them, so the AI can use them.

### Story Evolution

- Users can evolve their own stories using context from linked shared stories (AI sees them in RAG)
- Users cannot evolve a shared story directly — they can only write their own story inspired by it
- The elicitation phase of story evolution can reference shared content

---

## Migration Strategy

### Alembic Migrations

**Migration 1: Schema — Create persons table, add person_id**
- Create `persons` table with all columns and indexes
- Add `legacies.person_id` as NULLABLE UUID FK
- Add btree index on `legacies.person_id`

**Migration 2: Data — Backfill person records**
- For each existing legacy: INSERT Person with `canonical_name` = legacy.name, copy dates
- UPDATE legacies SET person_id = new person ID
- Run in batches (1000 rows) to avoid long locks

**Migration 3: Schema — Enforce NOT NULL, create link tables**
- ALTER `legacies.person_id` SET NOT NULL
- Create `legacy_links` table with all columns, indexes, constraints
- Create `legacy_link_shares` table with all columns, indexes, constraints

### Rollout Phases

| Phase | Ships | Risk |
|-------|-------|------|
| **1a: Person entity** | persons table, person_id on legacies, backfill. Legacy creation auto-creates Person. No user-facing changes. | Low |
| **1b: Identity matching** | Match candidates endpoint, frontend UI in creation form, async matching background task | Medium |
| **1c: Linking** | Link request flow, share management, integrated shared content view, AI context expansion | High |

Each phase deployable independently. Feature flags optional but recommended for 1b and 1c.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| False positive matches | High thresholds (0.5 inline, 0.8 async), always require explicit confirmation |
| Privacy leak via matching | Response shows only Person attributes — never legacy names, creators, or content |
| Matching query performance | pg_trgm GIN index, candidate limit of 5, sub-100ms target |
| Stale access after revoke | Queries always check `status = 'active'`, no caching of shared content lists |
| AI context pollution | Persona prompts already handle multiple perspectives; shared stories are additional context |
| Orphaned Person records | Lightweight records, keep indefinitely, optional cleanup job |

## Open Product Questions

1. **Admin link permissions** — Design assumes creator AND admin can initiate/respond to link requests. Confirm.
2. **Deleted shared content** — If source story is deleted, shared record remains but returns 404 gracefully. Confirm.
3. **Link limits** — No limit on active links per legacy for now. Revisit if abuse occurs.
4. **Re-request after rejection** — 30-day cooldown before re-requesting. Confirm period.

## Deferred to Phase 2

- **Legacy merging** — consolidating two legacies into one
- **Person as navigable entity** — Person profile page aggregating linked legacies
- **Relationship graph hints** — NLP extraction of relationships from story content for matching
- **Neptune migration** — graph database for relationship traversals
