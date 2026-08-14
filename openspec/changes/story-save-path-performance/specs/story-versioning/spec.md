## ADDED Requirements

### Requirement: Versions mark boundaries, not keystrokes
The system SHALL create a story version only at a boundary: publishing a story, entering the AI workspace, applying an AI-generated rewrite, restoring a previous version, or the close of an editing session. A save that changes only a story's title or content SHALL persist that change without creating a version.

#### Scenario: Autosave during an editing session
- **WHEN** an author types for several minutes and autosave fires repeatedly
- **THEN** each change is persisted and the story's version history gains no new entries while the session remains open

#### Scenario: Publishing captures a version
- **WHEN** an author publishes a draft story
- **THEN** a version exists capturing the title and content as published

#### Scenario: Entering the AI workspace captures a version
- **WHEN** an author enters the AI workspace on a story they have just been editing
- **THEN** a version exists capturing the pre-AI state, so the author can return to it

### Requirement: Editing sessions close without user action
The system SHALL treat an editing session as closed once no save has arrived for a configured idle period, and SHALL cap a continuously active session at a configured maximum duration. On either event the system SHALL create a version capturing the content as of the end of that session. Closure SHALL NOT depend on the client successfully signalling it.

#### Scenario: Author stops editing and returns later
- **WHEN** an author edits a story, leaves it idle past the idle period, and then saves again
- **THEN** the earlier session appears in version history as a single version holding the content it ended with, and the new edits begin a new session

#### Scenario: Version history read after a session ends
- **WHEN** an author opens version history after an editing session has gone idle
- **THEN** that session's version is present without the author taking any explicit save action

#### Scenario: Very long continuous session
- **WHEN** an author edits continuously for longer than the configured maximum session duration
- **THEN** a version is created capturing the work so far and editing continues in a new session

#### Scenario: Client signal never arrives
- **WHEN** an author's browser tab closes or loses connectivity before any end-of-session signal reaches the server
- **THEN** no typed content is lost, and the session still receives its version by the time of the next save or the next version-history read

### Requirement: Saves never wait on generated content
A story save SHALL complete without waiting for change-summary generation or search re-indexing. A slow or unavailable language model SHALL NOT increase save latency, fail a save, or delay unrelated requests.

#### Scenario: Model is slow or unavailable
- **WHEN** an author saves a story while the language model is unresponsive
- **THEN** the save completes normally and the author sees the saved state

#### Scenario: Saves do not block other requests
- **WHEN** change-summary generation is running for a story
- **THEN** other API requests, including requests touching the same story, proceed without waiting on it

### Requirement: Every version carries a change summary
Every version SHALL have a non-empty change summary from the moment it is created. The system SHALL first record a deterministic summary describing the version's origin, and MAY afterwards replace it with a generated description of what changed. A generated summary SHALL NOT overwrite a summary that already describes a deliberate action such as a restoration.

#### Scenario: Generation succeeds
- **WHEN** change-summary generation completes for a newly created version
- **THEN** version history shows the generated description of what changed

#### Scenario: Generation fails or times out
- **WHEN** change-summary generation fails, times out, or is skipped under load
- **THEN** version history shows the deterministic summary and the author sees no error

#### Scenario: Restoration summary is preserved
- **WHEN** a version was created by restoring an earlier version
- **THEN** its summary continues to identify the restored version and is not replaced by generated text

### Requirement: Change summaries describe the session
A generated change summary SHALL describe the difference between the new version and the previous version — the state captured at the prior boundary — rather than the difference since the most recent individual save.

#### Scenario: Session with many small edits
- **WHEN** an author makes many small edits across one session and the session closes
- **THEN** the summary describes the cumulative change since the previous version, not the last keystrokes before the session ended

### Requirement: Search indexing follows version boundaries
The system SHALL re-index a story's content at version boundaries rather than on every save. Index staleness for an in-progress editing session SHALL be bounded by the close of that session.

#### Scenario: Search during an open session
- **WHEN** a search runs while an author is mid-session on a story
- **THEN** the search may return results reflecting the story's state at the last boundary, and the author's own reading of the story still shows their latest saved text

#### Scenario: Search after a session closes
- **WHEN** an editing session closes
- **THEN** the story's indexed content reflects the content captured by that session's version
