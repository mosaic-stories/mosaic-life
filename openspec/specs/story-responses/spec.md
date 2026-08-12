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

### Requirement: Members can turn their own long response into a standalone story
The author of a response of more than four sentences SHALL be offered a gentle, inline way to turn that response into its own standalone story. Taking the offer SHALL open the story Edit page pre-seeded with the response's text verbatim (as raw body, not a quotation), associated with the same legacy the responded-to story belongs to, defaulting to private visibility. The offer SHALL be shown only to the response's own author, SHALL NOT appear on another member's response or on a response of four or fewer sentences, and SHALL be dismissible once per response (persisted so it does not reappear for that response). The offer SHALL NOT, by itself, change any story or legacy access rule, publish anything, or alter the response's content.

#### Scenario: Author of a long response is offered to make it a story
- **WHEN** a member views their own response of more than four sentences
- **THEN** a gentle inline offer (e.g. "This sounds like its own story") is shown on that response

#### Scenario: Short response shows no offer
- **WHEN** a member views their own response of four or fewer sentences
- **THEN** no "make this a story" offer is shown on that response

#### Scenario: Offer is author-only
- **WHEN** a member views another member's response, however long
- **THEN** no "make this a story" offer is shown to them for that response

#### Scenario: Taking the offer seeds a private new story in the same legacy
- **WHEN** the author takes the offer on their long response
- **THEN** the story Edit page opens pre-filled with the response's text verbatim, associated with the same legacy as the responded-to story, and defaulted to private, ready for the author to title, edit, and choose whether to publish

#### Scenario: Dismissing the offer hides it for that response
- **WHEN** the author dismisses the offer on a response
- **THEN** the offer is not shown again for that response, including on a later visit or another device

#### Scenario: Seeded draft indicates it is not yet saved
- **WHEN** the author is on the seeded Edit page but has not yet made an edit
- **THEN** an indicator communicates the story is not saved yet and that making a modification will save it (the draft is not persisted until the first edit)

### Requirement: A converted response becomes a non-editable note linking to the new story
Once the seeded story is created, the source response SHALL be presented as a note that links to the new story (e.g. "Turned this into a story ->") instead of its original body, and the note SHALL NOT be editable. The new story SHALL record a link back to the source story so readers can navigate between the two. The note's author SHALL be able to delete the note. If the converted story is later deleted, the original response SHALL be restored (its original body, editable again).

#### Scenario: Source response renders as a note after the story is created
- **WHEN** the seeded story has been created from a response
- **THEN** that response is shown as a note linking to the new story, with no in-place edit affordance

#### Scenario: New story links back to the source story
- **WHEN** a reader views a story that was created from a response
- **THEN** the story shows a link back to the source story it grew out of, and the source story reciprocally surfaces the stories grown from its responses

#### Scenario: Note author deletes the note
- **WHEN** the author of a note deletes it
- **THEN** the note no longer appears in the response list

#### Scenario: Deleting the converted story restores the original response
- **WHEN** the story created from a response is deleted
- **THEN** the note reverts to the original response with its original body, editable by its author again

### Requirement: The story author can hide a converted note from others
The author of the story a response was written against SHALL be able to hide a converted note so that it remains visible to the note's own author but is hidden from every other viewer. This applies only to converted notes; it does not change the existing response removal rights (author or legacy creator/admin) for ordinary responses.

#### Scenario: Story author hides a note
- **WHEN** the author of the story hides a converted note on that story
- **THEN** the note is no longer shown to other viewers of the story

#### Scenario: Hidden note stays visible to its own author
- **WHEN** the author of a note that the story author has hidden views the story
- **THEN** they still see their own note
