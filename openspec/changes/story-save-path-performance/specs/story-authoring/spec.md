## MODIFIED Requirements

### Requirement: Autosave with calm feedback
The edit page SHALL autosave changes and reflect state through a quiet indicator (e.g. "Saving…" / "Saved"). If a save fails, the user's text SHALL be preserved locally and the page SHALL offer a retry; typed content SHALL never be silently lost. Saves SHALL be serialized — a save triggered while one is already in flight SHALL be queued rather than issued as an overlapping request, so an older in-flight save can never resolve after (and overwrite) a newer one. An autosave that changes only title or content SHALL persist that change without creating a story version and without waiting on language-model or search-indexing work, so save latency does not depend on those services (see `story-versioning`).

#### Scenario: Autosave succeeds
- **WHEN** the user pauses typing
- **THEN** changes are saved and the indicator shows "Saved" without interrupting writing

#### Scenario: Save fails
- **WHEN** a save request fails
- **THEN** the typed content remains in the editor and an unobtrusive retry affordance appears

#### Scenario: Rapid edits during a slow save
- **WHEN** the user keeps typing while a previous autosave is still in flight
- **THEN** no second request is sent until the in-flight one completes, and a save with the latest content follows immediately after

#### Scenario: Autosave while the language model is degraded
- **WHEN** the user pauses typing while the language model is slow or unavailable
- **THEN** the save completes and the indicator reaches "Saved" at its normal speed

#### Scenario: Leaving the edit page
- **WHEN** the user navigates away from the edit page after editing
- **THEN** their latest text is already saved, and the editing session is closed so it appears in version history
