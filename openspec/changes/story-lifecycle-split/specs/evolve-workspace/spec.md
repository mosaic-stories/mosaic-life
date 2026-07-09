# evolve-workspace (delta)

## ADDED Requirements

### Requirement: Evolve is entered deliberately
The Evolve workspace (`/legacy/:legacyId/story/:storyId/evolve`) SHALL be reachable only through explicit user actions on the Read or Edit pages. No create affordance SHALL route directly to Evolve. Browser back from Evolve SHALL return to the page the user entered from.

#### Scenario: Entering Evolve from Read
- **WHEN** an author chooses the AI-workspace action on the reading page
- **THEN** the Evolve workspace opens, and browser back returns to the reading page

#### Scenario: Create affordances bypass Evolve
- **WHEN** a user activates any story-create affordance
- **THEN** they land on the edit page, not the Evolve workspace

### Requirement: No side effects before the first AI action
Opening the Evolve workspace SHALL NOT create an evolution session, an AI conversation, or any other record. A session and its conversation SHALL be created only when the user takes their first AI action (sending a chat message, extracting context, or starting a rewrite), and only one conversation SHALL be created — for the persona actually used. Empty sessions and zero-message conversations SHALL never be created.

#### Scenario: Visit and leave without acting
- **WHEN** a user opens the Evolve workspace and navigates away without any AI action
- **THEN** no session or conversation exists (verifiable on the Conversations page and in the database)

#### Scenario: First chat message creates exactly one conversation
- **WHEN** a user sends their first message to a persona in Evolve
- **THEN** one evolution session and one conversation (for that persona only) are created, and no conversations exist for unused personas

### Requirement: Discarding an AI draft never deletes the story
Discarding an evolution session SHALL remove only the session, its conversation(s), and unapplied AI draft state. The underlying story record and its saved content SHALL remain unchanged.

#### Scenario: Discard after experimenting
- **WHEN** an author discards an evolution session
- **THEN** the story still exists with its last-saved title and content intact

### Requirement: Evolve capabilities remain intact
With lazy session creation in place, all existing Evolve capabilities — persona chat, context extraction, rewrite with diff review, version history, media, and finish with visibility selection — SHALL continue to function end-to-end.

#### Scenario: Full evolve flow after lazy creation
- **WHEN** a user enters Evolve, chats, extracts context, runs a rewrite, reviews the diff, and finishes with a visibility choice
- **THEN** each step completes as it does today, with the session created at the first AI action rather than on mount
