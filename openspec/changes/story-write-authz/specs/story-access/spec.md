## MODIFIED Requirements

### Requirement: Author-only editing
Only the story's author SHALL modify any story-owned state. This covers the story's content, title, visibility, and status, and equally its **versions and drafts**, **AI-assisted rewrite output**, and **evolution-session state**. No membership role SHALL grant edit access to another user's story, on any surface, including AI-assisted ones.

#### Scenario: Legacy creator cannot edit another's story
- **WHEN** the `creator` of an associated legacy attempts to update a story authored by someone else
- **THEN** the API responds 403 and the story is unchanged

#### Scenario: Reader of a public story cannot rewrite it
- **WHEN** an authenticated user who is not the author requests an AI rewrite of a `public` story
- **THEN** the API responds 403, no new version is created, and the author's existing draft and evolution session are unchanged

#### Scenario: Legacy member cannot manage another author's versions
- **WHEN** a non-pending member of an associated legacy attempts to create, restore, or delete a version of a story authored by someone else
- **THEN** the API responds 403 and no version is created, restored, or deleted

## ADDED Requirements

### Requirement: Write access is never inferred from read access
An endpoint that mutates story-owned state SHALL authorize the mutation against the write rule above. Read access SHALL NOT be sufficient to authorize any mutation, regardless of the story's visibility scope. An endpoint whose writes are keyed entirely to the calling user's own records (for example, that user's extracted story context) is not a story mutation and remains governed by the read rule.

#### Scenario: Read grant does not confer write
- **WHEN** a user has read access to a story through visibility, legacy membership, or a legacy-link share, and is not its author
- **THEN** every endpoint that would modify that story's content, versions, drafts, or evolution state responds 403 and the story's state is unchanged

#### Scenario: Per-user derived data still follows the read rule
- **WHEN** a user with read access to a story triggers extraction of their own story context, or pins or dismisses one of their own extracted facts
- **THEN** the request succeeds and affects only that user's records, leaving the story and every other user's records unchanged

### Requirement: Write endpoints do not disclose another author's draft
A write request against a story with status `draft` authored by someone else SHALL respond 404, not 403, so the draft's existence is not disclosed — matching the read rule. This SHALL hold on every write surface, including update, versions, evolution, and AI rewrite.

#### Scenario: Non-author writes to another author's draft
- **WHEN** a user who is not the author attempts to update, version, evolve, or rewrite a story whose status is `draft`
- **THEN** the API responds 404 and nothing is created or modified
