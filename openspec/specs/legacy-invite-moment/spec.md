# legacy-invite-moment

## Purpose

The dismissible, per-legacy-persisted prompt shown after a legacy's first story publish (or legacy creation, before any story exists) that invites the sole member to add the people who knew the subject, opening the existing member-invite flow.

## Requirements

### Requirement: Post-first-publish invite prompt
When a legacy has exactly one non-pending member and exactly one published story, the app SHALL show a dismissible full-card prompt inviting the member to add the people who knew the subject (e.g. "Karen's page is ready. Invite the people who knew her."). The prompt SHALL open the existing invite flow when actioned.

#### Scenario: First story published on a single-member legacy
- **WHEN** the sole member of a legacy publishes that legacy's first story
- **THEN** the invite prompt appears on the legacy's page

#### Scenario: Legacy created with no stories yet
- **WHEN** a user creates a new legacy and has not yet published any story on it
- **THEN** the invite prompt appears on the legacy's page

#### Scenario: Prompt opens the invite flow
- **WHEN** a member selects the invite prompt's call to action
- **THEN** the existing member-invite modal opens, pre-scoped to that legacy

#### Scenario: Prompt does not appear once a legacy has multiple members
- **WHEN** a legacy already has two or more non-pending members
- **THEN** the invite prompt SHALL NOT appear regardless of published story count

### Requirement: Invite prompt dismissal persists per legacy
Dismissing the invite prompt SHALL persist for that legacy: the prompt SHALL NOT reappear for any member of that legacy after any one member has dismissed it.

#### Scenario: One member dismisses, prompt stays hidden for all
- **WHEN** a member dismisses the invite prompt on a legacy
- **THEN** the prompt no longer appears for that legacy, including for other members who view the page afterward
