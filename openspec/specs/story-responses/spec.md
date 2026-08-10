# story-responses

## Purpose

How legacy members respond to and react to a story on its reading page: flat-list plain-text written responses (with author edit and author/admin removal rights), a fixed set of three toggleable reactions (heart, candle, smile), response/reaction counts surfaced on the read page and on story cards, membership-gated read/write access, in-app notification fan-out on response and reaction, and cursor-paginated response listing. Attaches to the reading surface defined in `story-reading`.

## Requirements

### Requirement: Legacy members can respond to a story
A non-pending member of any legacy associated with a story, or the story's author, SHALL be able to submit a plain-text written response to that story. Users who are not members of any associated legacy SHALL be denied, even when the story's visibility scope would otherwise let them read it.

#### Scenario: Member submits a response
- **WHEN** a non-pending legacy member submits a response with body text on a story they can read
- **THEN** the response is created and appears in the story's response list without a page reload

#### Scenario: Non-member is denied
- **WHEN** a user who is not a member of any legacy associated with a story attempts to submit a response
- **THEN** the API responds 403 and no response is created

#### Scenario: Response body is plain text only
- **WHEN** a response is submitted containing HTML tags or markdown formatting syntax
- **THEN** the stored and rendered response preserves line breaks but SHALL NOT render any HTML/rich formatting

### Requirement: Responses render as a flat list below the story body
The Read page SHALL render a "Memories & responses" section below the story body, listing responses in a flat (non-threaded) list ordered oldest-first, each showing the responder's avatar, name, and relative timestamp.

#### Scenario: Multiple responses on a story
- **WHEN** a story has three responses from three different members
- **THEN** the section shows all three in the order they were created, with no nesting or reply-to-reply structure

### Requirement: Authors can edit their own response in place
The author of a response SHALL be able to edit its body. An edited response SHALL display an "edited" marker distinguishing it from an unedited response.

#### Scenario: Author edits a response
- **WHEN** the author of a response changes its body text and saves
- **THEN** the response displays the updated text with an "edited" marker

#### Scenario: Non-author cannot edit
- **WHEN** a user other than the response's author attempts to edit it
- **THEN** the API responds 403 and the response is unchanged

### Requirement: Response removal rights
A response SHALL be removable by its author, or by a member with role `creator` or `admin` on a legacy associated with the story. A member with role `advocate` or `admirer` SHALL NOT be able to remove another member's response.

#### Scenario: Author deletes own response
- **WHEN** the author of a response deletes it
- **THEN** the response no longer appears in the list and the story's response count decreases by one

#### Scenario: Legacy admin removes another member's response
- **WHEN** a legacy member with role `admin` deletes a response authored by a different member on that legacy's story
- **THEN** the response is removed

#### Scenario: Advocate cannot remove another member's response
- **WHEN** a legacy member with role `advocate` attempts to delete a response authored by a different member
- **THEN** the API responds 403 and the response is unchanged

### Requirement: Fixed, toggleable reaction set for legacy members
A non-pending member of any legacy associated with a story, or the story's author, SHALL be able to react to that story with at most one of each of three fixed reaction types: `heart` ("Love this"), `candle` ("Lighting a candle"), `smile` ("This made me smile"). Reacting again with the same type SHALL remove that reaction (toggle). Users who are not legacy members SHALL be denied.

#### Scenario: Member reacts to a story
- **WHEN** a non-pending legacy member reacts to a story with `heart` for the first time
- **THEN** the reaction is recorded and the story's heart count increases by one

#### Scenario: Toggling a reaction off
- **WHEN** a member who has already reacted with `candle` reacts with `candle` again
- **THEN** the reaction is removed and the story's candle count decreases by one

#### Scenario: One of each type per user
- **WHEN** a member has already reacted with `heart` and then reacts with `smile` on the same story
- **THEN** both reactions coexist for that user, and reacting with `heart` a second time only removes the `heart` reaction

#### Scenario: Non-member is denied
- **WHEN** a user who is not a member of any legacy associated with a story attempts to react to it
- **THEN** the API responds 403 and no reaction is recorded

### Requirement: Response and reaction counts are visible wherever a story is summarized
A story's response count and per-type reaction counts SHALL be shown on the Read page and on story cards (legacy page, hubs) alongside existing metadata, and SHALL update after a response or reaction is added or removed.

#### Scenario: Counts appear on a story card
- **WHEN** a story with two responses and one heart reaction appears on a legacy page or hub
- **THEN** its story card shows a response count of two and a heart count of one

### Requirement: Response and reaction notifications
The story author SHALL receive an in-app notification naming the responder and the story when a response or reaction is created on their story, unless the author is the one who created it. When a response is created, every distinct prior responder on that story (excluding the new response's author and the story's author) SHALL also receive an in-app notification that someone else responded, without threading.

#### Scenario: Author notified of a new response
- **WHEN** a member other than the story's author submits a response
- **THEN** the story author receives a notification naming the responder and the story (e.g. "Sue responded to 'The Fenway lunch'")

#### Scenario: Prior responder notified of a later response
- **WHEN** member A has already responded to a story and member B submits a new response
- **THEN** member A receives a notification that someone else also responded, and no threading/reply relationship is recorded

#### Scenario: Actor is not notified of their own action
- **WHEN** the story author submits a response or reaction on their own story
- **THEN** no notification is created for that action

### Requirement: Response list is cursor-paginated
The endpoint listing a story's responses SHALL accept a `cursor` and `limit` query parameter and return a `next_cursor` and `has_more` flag, following the same cursor-pagination convention used by the activity feed.

#### Scenario: Paginating responses
- **WHEN** a story has more responses than the requested `limit`
- **THEN** the response includes `has_more: true` and a `next_cursor` that retrieves the next page
