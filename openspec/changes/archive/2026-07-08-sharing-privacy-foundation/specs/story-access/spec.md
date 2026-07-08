# story-access

Who can read, list, create, edit, and delete a story. A story has exactly one author, a visibility scope, a draft/published status, and zero or more associated legacies. Scopes define the audience; membership roles define capabilities.

Note: scenarios below encode the owner-recorded decisions on `proposal.md` Open Questions Q2, Q3, Q5, Q6 (2026-07-08).

## ADDED Requirements

### Requirement: Story visibility scopes
A story SHALL have exactly one visibility scope: `public`, `private`, or `personal`. New stories SHALL default to `private`. The API SHALL reject any other value, and the database SHALL refuse to store one.

#### Scenario: Invalid scope rejected
- **WHEN** a client creates or updates a story with `visibility: "friends"`
- **THEN** the API responds 422 and the story is unchanged

#### Scenario: Default scope
- **WHEN** a member creates a story without specifying visibility
- **THEN** the stored story has visibility `private`

### Requirement: Public story access
A `public` story SHALL be readable by any authenticated user, and SHALL appear in the unauthenticated public story list for its legacy.

#### Scenario: Unauthenticated public list
- **WHEN** an unauthenticated client requests the public stories of a legacy
- **THEN** only stories with visibility `public` and status `published` are returned

#### Scenario: Authenticated non-member reads public story
- **WHEN** an authenticated user with no membership in any associated legacy requests a `public` story's detail
- **THEN** the story is returned

### Requirement: Personal story access
A `personal` story SHALL be readable only by its author, on every surface (detail, lists, AI retrieval, graph context). A `personal` story SHALL never be granted to another user by membership, role, or legacy link.

#### Scenario: Non-author denied
- **WHEN** any user other than the author requests a `personal` story's detail
- **THEN** the API responds 403

#### Scenario: Author sees own personal stories in lists
- **WHEN** the author lists stories for a legacy the story is associated with
- **THEN** the `personal` story is included for the author and excluded for every other member

### Requirement: Private story access
A `private` story SHALL be readable by its author and by every non-pending member of any associated legacy, regardless of role (per Q5: scopes are audience, roles are capabilities). A `private` story with no legacy associations SHALL be readable only by its author.

#### Scenario: Member of any associated legacy reads
- **WHEN** a story is associated with legacies A and B, and a non-pending member of B (role `admirer`) requests its detail
- **THEN** the story is returned

#### Scenario: Non-member denied
- **WHEN** a user who is not a member of any associated legacy (and has no legacy-link grant) requests a `private` story's detail
- **THEN** the API responds 403

#### Scenario: Orphaned private story
- **WHEN** a `private` story has no legacy associations and a user other than the author requests it
- **THEN** the API responds 403

### Requirement: Draft stories are invisible to non-authors
A story with status `draft` SHALL be returned only to its author. Other users SHALL receive 404 (not 403) so the draft's existence is not disclosed, even when its visibility scope would otherwise allow access. Drafts SHALL be excluded from all lists, retrieval, and graph surfaces for non-authors.

#### Scenario: Member requests another member's draft
- **WHEN** a non-pending member of the story's legacy requests a `draft` story authored by someone else
- **THEN** the API responds 404

### Requirement: Story creation requires a contributing role
Creating a story SHALL require the user to hold role `advocate` or higher in at least one target legacy (per Q6; `admirer` is view-only). Associating an existing story with additional legacies SHALL apply the same rule per added legacy.

#### Scenario: Admirer cannot create
- **WHEN** a user whose only membership in the target legacy is `admirer` creates a story there
- **THEN** the API responds 403

#### Scenario: Advocate creates
- **WHEN** an `advocate` member of the target legacy creates a story there
- **THEN** the story is created with that user as author

### Requirement: Author-only editing
Only the story's author SHALL update a story's content, title, visibility, or status. No membership role SHALL grant edit access to another user's story.

#### Scenario: Legacy creator cannot edit another's story
- **WHEN** the `creator` of an associated legacy attempts to update a story authored by someone else
- **THEN** the API responds 403 and the story is unchanged

### Requirement: Story deletion rights
A story SHALL be deletable by its author, and by a `creator` of any associated legacy.

#### Scenario: Legacy creator deletes
- **WHEN** the `creator` of an associated legacy deletes a story authored by someone else
- **THEN** the story is deleted

#### Scenario: Admin cannot delete another's story
- **WHEN** an `admin` of an associated legacy attempts to delete a story authored by someone else
- **THEN** the API responds 403

### Requirement: Legacy-link share grants
When two legacies have an **active** legacy link, members of one legacy SHALL gain read access to the other legacy's stories according to the sharing side's share mode: `all` grants every `public` and `private` story; `selective` grants only stories with an explicit share record. Link-shared stories SHALL be subject to the same audience rule as local `private` stories (per Q3) and SHALL appear in the receiving legacy's story lists attributed to their origin legacy (per Q2). Grants SHALL apply identically on every surface, including the story detail endpoint. `personal` stories and drafts SHALL never cross a link.

#### Scenario: Share-mode all grants detail access
- **WHEN** legacies A and B have an active link, B's share mode is `all`, and a member of A requests the detail of a `private` published story in B
- **THEN** the story is returned

#### Scenario: Selective mode limits the grant
- **WHEN** B's share mode is `selective` and only story S1 has a share record, and a member of A requests story S2 from B
- **THEN** the API responds 403

#### Scenario: Inactive links grant nothing
- **WHEN** a link between A and B is `pending`, `rejected`, or `revoked`, and a member of A requests a `private` story in B
- **THEN** the API responds 403

#### Scenario: Revocation is immediate
- **WHEN** an active link is revoked and a member of A then requests a previously link-shared story in B
- **THEN** the API responds 403

### Requirement: Access decisions are identical on every surface
For a given user and story, the read decision SHALL be the same on the story detail endpoint, story lists, AI/RAG retrieval, and graph-context filtering. No surface SHALL grant access that another denies.

#### Scenario: AI-visible story is directly readable
- **WHEN** a story is eligible to appear in a user's AI conversation context
- **THEN** a request by that user for the story's detail endpoint succeeds

#### Scenario: Denied story never reaches AI context
- **WHEN** a user may not read a story per the rules above
- **THEN** that story's content is excluded from the user's AI retrieval and graph-context results
