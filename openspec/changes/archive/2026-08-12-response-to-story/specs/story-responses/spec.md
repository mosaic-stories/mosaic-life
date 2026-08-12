## ADDED Requirements

### Requirement: Members can turn their own long response into a standalone story

The author of a response of **more than four sentences** SHALL be offered a gentle, inline way to turn that response into its own standalone story. Taking the offer SHALL open the story Edit page pre-seeded with the response's text **verbatim** (as raw body, not a quotation), associated with the **same legacy** the responded-to story belongs to, defaulting to **private** visibility. The offer SHALL be shown only to the response's own author, SHALL NOT appear on another member's response or on a response of four or fewer sentences, and SHALL be **dismissible once per response** (persisted so it does not reappear for that response). The offer SHALL NOT, by itself, change any story or legacy access rule, publish anything, or alter the response's content.

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

Once the seeded story is created, the source response SHALL be presented as a **note** that links to the new story (e.g. "Turned this into a story →") instead of its original body, and the note SHALL NOT be editable. The new story SHALL record a link back to the **source story** so readers can navigate between the two. The note's author SHALL be able to delete the note. If the converted story is later deleted, the original response SHALL be restored (its original body, editable again).

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

The author of the story a response was written against SHALL be able to hide a **converted note** so that it remains visible to the note's own author but is hidden from every other viewer. This applies only to converted notes; it does not change the existing response removal rights (author or legacy creator/admin) for ordinary responses.

#### Scenario: Story author hides a note
- **WHEN** the author of the story hides a converted note on that story
- **THEN** the note is no longer shown to other viewers of the story

#### Scenario: Hidden note stays visible to its own author
- **WHEN** the author of a note that the story author has hidden views the story
- **THEN** they still see their own note
