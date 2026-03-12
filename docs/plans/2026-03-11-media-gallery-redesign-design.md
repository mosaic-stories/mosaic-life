# Media Gallery Redesign — Design Document

> **Status:** APPROVED
> **Date:** 2026-03-11
> **Reference mockup:** `mosaic-media-gallery-redesign.jsx` (root directory)

## Goal

Replace the basic photo grid + modal in the Media Gallery tab with a rich, persistent side detail panel featuring metadata editing, people tagging, tags, and AI insight stubs. Add full backend support for media metadata, person tagging, and tag management.

## Architecture Decisions

1. **Replace sidebar when media tab is active** — `LegacyProfile` hides `LegacySidebar` when `activeSection === 'media'`. `MediaSection` manages its own `grid-cols-[1fr_400px]` layout for gallery + detail panel.
2. **Reuse existing Person model** for people tagging via new `MediaPerson` association table. Unified identity across photos, legacies, and stories.
3. **New Tag model** with per-legacy scoping via `legacy_id`. Association table `MediaTag` links tags to media.
4. **Mobile detail panel** uses shadcn `Sheet` (bottom drawer) instead of inline panel.
5. **Linked Stories and AI Insights** are frontend stubs only — no backend work in this pass.

---

## Backend Data Model

### New columns on `media` table

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `caption` | `Text` | Yes | User-written caption |
| `date_taken` | `String(100)` | Yes | Free-text: "~1988", "Summer 2024" |
| `location` | `String(255)` | Yes | Free-text: "Galápagos Islands, Ecuador" |
| `era` | `String(50)` | Yes | Decade/period: "1980s", "College years" |
| `ai_description` | `Text` | Yes | AI-generated description (future) |
| `ai_insights` | `JSONB` | Yes | AI-generated insights array (future) |

### New `tags` table

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `name` | String(100) | NOT NULL |
| `legacy_id` | UUID | FK → legacies.id, CASCADE |
| `created_by` | UUID | FK → users.id, SET NULL |
| `created_at` | datetime | server default |
| | | UNIQUE(name, legacy_id) |

Index on `(legacy_id, name)` for autocomplete queries.

### New `media_tags` association table

| Column | Type | Constraints |
|--------|------|-------------|
| `media_id` | UUID | FK → media.id, CASCADE, PK |
| `tag_id` | UUID | FK → tags.id, CASCADE, PK |

### New `media_persons` association table

| Column | Type | Constraints |
|--------|------|-------------|
| `media_id` | UUID | FK → media.id, CASCADE, PK |
| `person_id` | UUID | FK → persons.id, CASCADE, PK |
| `role` | String(50) | NOT NULL, default "subject" |

Role values: `subject`, `family`, `friend`, `other`.

---

## API Endpoints

### Updated endpoints

| Endpoint | Method | Changes |
|----------|--------|---------|
| `GET /api/media/?legacy_id={id}` | GET | Response includes `caption`, `date_taken`, `location`, `era`, `tags[]`, `people[]` |
| `GET /api/media/{id}` | GET | Same expanded response |

### New endpoints

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `PUT /api/media/{id}` | PUT | `{caption?, date_taken?, location?, era?}` | Updated `MediaDetail` |
| `GET /api/media/{id}/people` | GET | — | `MediaPerson[]` |
| `POST /api/media/{id}/people` | POST | `{person_id, role}` or `{name, role}` | Created `MediaPerson` |
| `DELETE /api/media/{id}/people/{person_id}` | DELETE | — | 204 |
| `GET /api/media/{id}/tags` | GET | — | `Tag[]` |
| `POST /api/media/{id}/tags` | POST | `{name}` | Created `Tag` + association |
| `DELETE /api/media/{id}/tags/{tag_id}` | DELETE | — | 204 |
| `GET /api/tags?legacy_id={id}` | GET | — | `Tag[]` (for autocomplete) |
| `GET /api/persons/search?q={query}&legacy_id={id}` | GET | — | `Person[]` (trigram search) |

### Schema changes

**MediaUpdate** (new Pydantic schema):
```
caption: str | None
date_taken: str | None
location: str | None
era: str | None
```

**MediaSummary** (expanded):
```
+ caption: str | None
+ date_taken: str | None
+ location: str | None
+ era: str | None
+ tags: list[TagResponse]
+ people: list[MediaPersonResponse]
```

**TagResponse**: `{id, name}`
**MediaPersonResponse**: `{person_id, person_name, role}`

---

## Frontend Architecture

### Layout

`LegacyProfile` conditionally hides `LegacySidebar` when `activeSection === 'media'`. The grid changes to `grid-cols-1` to give `MediaSection` full width.

`MediaSection` manages its own layout:
- Panel closed: single column, gallery full width
- Panel open: `grid-cols-[1fr_400px]` with sticky detail panel

Mobile (`< lg`): detail panel renders as shadcn `Sheet` (bottom drawer).

### Component tree

```
MediaSection (layout owner, selectedMediaId state)
├── MediaGalleryHeader
│   ├── Title ("Media Gallery") + count subtitle
│   ├── View toggle (Grid active / Timeline disabled)
│   └── Upload button
├── MediaUploader (existing — restyled)
├── MediaGrid
│   └── MediaThumbnail (per photo: square, rounded, badges, hover overlay, selection border)
├── MediaDetailPanel (desktop: sticky side panel)
│   ├── ImagePreview (dark bg, nav arrows, action bar)
│   ├── CaptionSection (click-to-edit, DetailSection wrapper)
│   ├── AIInsightsSection (stubbed — "coming soon")
│   ├── MediaDetailsSection (MetadataRow × 3 + file info)
│   ├── PeopleSection (list + inline search/create)
│   ├── TagsSection (pills + inline autocomplete)
│   └── LinkedStoriesSection (stubbed — "not linked")
└── MediaDetailSheet (mobile: Sheet wrapper around same panel content)
```

### Reusable components (in `features/media/components/`)

- **`DetailSection`** — Collapsible section: icon, uppercase title, chevron toggle, optional action slot, children.
- **`MetadataRow`** — Icon + label + click-to-edit value with empty/placeholder handling.
- **`TagPill`** — Small pill with label and optional X remove button.

### New hooks (in `features/media/hooks/`)

| Hook | Purpose |
|------|---------|
| `useUpdateMedia()` | PUT metadata fields |
| `useMediaPeople(mediaId)` | Fetch people tagged in a photo |
| `useTagPerson()` | POST tag a person |
| `useUntagPerson()` | DELETE remove person tag |
| `useMediaTags(mediaId)` | Fetch tags on a photo |
| `useAddTag()` | POST add tag |
| `useRemoveTag()` | DELETE remove tag |
| `useSearchPersons(query, legacyId)` | GET person search for autocomplete |
| `useLegacyTags(legacyId)` | GET all tags for a legacy (autocomplete) |

### Updated API client (`features/media/api/media.ts`)

Expand `MediaItem` interface with new fields. Add functions:
- `updateMedia(mediaId, data)` — PUT
- `listMediaPeople(mediaId)` — GET
- `tagPerson(mediaId, data)` — POST
- `untagPerson(mediaId, personId)` — DELETE
- `listMediaTags(mediaId)` — GET
- `addTag(mediaId, name)` — POST
- `removeTag(mediaId, tagId)` — DELETE
- `searchPersons(query, legacyId)` — GET
- `listLegacyTags(legacyId)` — GET

### Inline editing pattern

1. User clicks a metadata field → local state switches to input mode
2. On blur/Enter → call mutation (e.g., `useUpdateMedia`)
3. Optimistic cache update on the media list query
4. On error → revert local state, show toast

### What gets preserved

- `useMedia` hook (response shape expands but hook unchanged)
- `useMediaUpload` (upload flow unchanged)
- `useDeleteMedia` (delete flow unchanged)
- `useSetProfileImage` (profile image flow unchanged)
- `FavoriteButton` component (reused in detail panel action bar)
- File validation logic (10MB, JPEG/PNG/GIF/WebP)

---

## Person Tagging Flow

1. Click "+ Tag" → inline input appears: "Search or add a person..."
2. Type → dropdown shows matching persons from `GET /api/persons/search?q=...&legacy_id=...`
3. **Select existing** → `POST /api/media/{id}/people {person_id, role: "subject"}`
4. **Create new** → "Create [name]" option → same POST with `{name, role}` (backend creates Person + association)
5. Person row appears with role that can be changed inline
6. X button → `DELETE /api/media/{id}/people/{person_id}` (removes association, not the Person)

---

## Tag Management Flow

1. Click "+ Add tag" → inline input with autocomplete from `GET /api/tags?legacy_id=...`
2. **Select existing** → `POST /api/media/{id}/tags {name: "Travel"}` (backend finds existing tag, creates association)
3. **Create new** → type + Enter → same POST (backend creates Tag + association)
4. X on pill → `DELETE /api/media/{id}/tags/{tag_id}`

---

## Photo Grid Design

- Square thumbnails: `aspect-square`, `rounded-xl`
- Responsive columns: 4 default → 3 when panel open → 2 on `md` → 1 on mobile
- Selected state: `border-3 border-stone-700`, elevated shadow
- Hover overlay: bottom gradient with caption (2-line clamp)
- Badges: "Profile" pill (top-right), Favorite heart (top-right)

## Gallery Header

- Serif "Media Gallery" heading + "{N} photos · Uploaded by {N} contributors" subtitle
- View toggle: Grid (active) / Timeline (disabled, tooltip "Add dates to unlock")
- Upload button (primary brown style)

---

## Stubbed Features (frontend only)

### AI Insights Section
Warm gradient card: "AI photo analysis coming soon" + disabled "Analyze with AI" button. Structure ready for future `ai_description` and `ai_insights` fields.

### Linked Stories Section
Default collapsed. "Not linked to any stories" + disabled "+ Link" button. No backend model or endpoints.

### Timeline View
Toggle button visible but disabled. Shows "Add dates to photos to unlock timeline view" when clicked. Backend `era` field is stored but timeline grouping is frontend-only future work.

---

## Files Touched

### Backend (services/core-api/)
- `app/models/media.py` — add columns
- `app/models/tag.py` — new model
- `app/models/associations.py` — add `MediaTag`, `MediaPerson`
- `app/models/__init__.py` — register new models
- `app/schemas/media.py` — update schemas, add update schema
- `app/schemas/tag.py` — new schemas
- `app/routes/media.py` — add PUT, people, tag endpoints
- `app/routes/tag.py` — new tag listing route
- `app/routes/person.py` — add search endpoint (or new file)
- `app/main.py` — register new routers
- `alembic/versions/` — new migration

### Frontend (apps/web/)
- `src/features/legacy/components/LegacyProfile.tsx` — hide sidebar for media tab
- `src/features/legacy/components/MediaSection.tsx` — rewrite as layout owner
- `src/features/media/api/media.ts` — expand types + new API functions
- `src/features/media/hooks/useMedia.ts` — new hooks
- `src/features/media/components/MediaGalleryInline.tsx` — replaced by new components
- `src/features/media/components/MediaUploader.tsx` — restyle
- New components (~8 files in `src/features/media/components/`)
