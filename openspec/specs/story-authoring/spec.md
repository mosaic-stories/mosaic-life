# story-authoring

## Purpose

The plain Edit surface for a story: create/edit routes, create-on-first-input semantics, debounced autosave, visibility control, working-title derivation, and render-time placeholder display for empty drafts. This is the writing surface of the story lifecycle — see `story-reading` for the read-only surface and `evolve-workspace` for the AI workspace.

## Requirements

### Requirement: Plain edit surface
The system SHALL provide a plain editing page at `/legacy/:legacyId/story/:storyId/edit` (existing stories) and `/legacy/:legacyId/story/new` (new stories) containing only: a title field, the story body editor, a visibility control, an autosave indicator, and one unobtrusive entry point to the AI workspace. It SHALL NOT show resizable panels, a tool rail, AI panels, or session controls.

#### Scenario: Author opens the edit page
- **WHEN** an author navigates to a story's edit page
- **THEN** they see title, body, visibility, and a save indicator — and nothing from the Evolve workspace

#### Scenario: Mobile editing
- **WHEN** the edit page is viewed at 390px width
- **THEN** it renders as a single column with no horizontal scroll

### Requirement: Create affordances lead to the edit page without writes
Every story-create affordance (legacy profile "Add Story", dashboard quick action, story-hub legacy picker, prompt cards, draft CTAs) SHALL navigate to the edit page in at most one click and SHALL NOT cause any API write on navigation. Prompt cards SHALL open the edit page seeded with their prompt as a quote in the body.

#### Scenario: Clicking Write a Story
- **WHEN** a user activates any create affordance
- **THEN** the plain edit page opens and no story, session, or conversation record has been created

#### Scenario: Quick capture from a prompt card
- **WHEN** a user selects a story prompt card (e.g. "What's the best advice…?")
- **THEN** the edit page opens with the prompt seeded as a quote in the body, and no API write has occurred

### Requirement: Story record is created on first input
For a new story, the system SHALL create the story record (as a draft) automatically on the user's first content input — never on navigation, and without requiring a manual "Save draft" action. After creation, the URL SHALL reflect the real story id such that browser back returns to the page the user came from, not to the `new` route. If the user leaves without any input, nothing SHALL be persisted.

#### Scenario: User types a first character
- **WHEN** a user on the new-story page enters their first input
- **THEN** a draft story record is created and subsequent edits save to it

#### Scenario: User abandons an empty new story
- **WHEN** a user opens the new-story page and leaves without typing or saving
- **THEN** no story record exists afterwards

### Requirement: Autosave with calm feedback
The edit page SHALL autosave changes and reflect state through a quiet indicator (e.g. "Saving…" / "Saved"). If a save fails, the user's text SHALL be preserved locally and the page SHALL offer a retry; typed content SHALL never be silently lost. Saves SHALL be serialized — a save triggered while one is already in flight SHALL be queued rather than issued as an overlapping request, so an older in-flight save can never resolve after (and overwrite) a newer one.

#### Scenario: Autosave succeeds
- **WHEN** the user pauses typing
- **THEN** changes are saved and the indicator shows "Saved" without interrupting writing

#### Scenario: Save fails
- **WHEN** a save request fails
- **THEN** the typed content remains in the editor and an unobtrusive retry affordance appears

#### Scenario: Rapid edits during a slow save
- **WHEN** the user keeps typing while a previous autosave is still in flight
- **THEN** no second request is sent until the in-flight one completes, and a save with the latest content follows immediately after

### Requirement: Working title derived from content
When a story is saved without a user-provided title, the system SHALL derive a working title from the first non-empty line of the content — Markdown syntax stripped, truncated to approximately 60 characters on a word boundary — and store it as the story's title. This derived title SHALL appear wherever story titles are shown (dashboard, hubs, lists). The system SHALL NOT persist any placeholder title of the form "Untitled Story – {date}".

#### Scenario: Untitled story with content
- **WHEN** a user saves a story beginning "I remember the lunch we had at the lake that summer…" without a title
- **THEN** the story's title everywhere is "I remember the lunch we had at the lake that summer…" truncated to ~60 characters

#### Scenario: No persisted placeholder titles
- **WHEN** any story is created through any affordance
- **THEN** no stored title matches "Untitled Story – {date}"

### Requirement: Render-time placeholder for empty drafts
A draft with no title and no content SHALL display as "Draft story" plus a relative date, generated at render time. This placeholder SHALL never be persisted or sent to the API.

#### Scenario: Empty draft in a list
- **WHEN** an empty draft appears in the dashboard or a hub
- **THEN** it displays "Draft story" with a relative date, and its stored title remains empty
