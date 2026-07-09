# story-reading (delta)

## ADDED Requirements

### Requirement: Default story URL is a reading page
The story's default URL (`/legacy/:legacyId/story/:storyId`) SHALL render the story as typographic reading content: serif body per the app's story typography, with no editor toolbar, no input-style border or box, and no editing affordances inline with the content. The page SHALL show the story's byline (author), date, visibility badge, a link to the owning legacy, and any inline media.

#### Scenario: Reading a published story
- **WHEN** any user with read access opens a story's default URL
- **THEN** the story renders as formatted text and media with no editor chrome, no bordered content box, and no purple evolution banner

#### Scenario: Mobile reading
- **WHEN** the reading page is viewed at 390px width
- **THEN** the page has no horizontal scroll and all metadata remains visible

### Requirement: Author actions are quiet and secondary
For the story's author, the reading page SHALL offer an `Edit` action and an overflow menu containing at minimum version history, delete, and the entry to the AI workspace. The AI-workspace entry SHALL live in the overflow menu only — no standalone button (proposal Q3 decision). Non-authors SHALL see none of these actions.

#### Scenario: Author views own story
- **WHEN** the author opens their story's reading page
- **THEN** an Edit button and an overflow menu are present without dominating the reading layout

#### Scenario: Non-author views a story
- **WHEN** a user who is not the author opens a story they can read
- **THEN** no Edit button, overflow menu, or AI-workspace entry is shown

### Requirement: Draft resume is a quiet inline line
When the viewing user has an unfinished evolution draft for the story, the reading page SHALL indicate it with a single inline text line under the title (e.g. "You have an unfinished draft — continue editing") linking to the draft. It SHALL NOT render a banner, and SHALL NOT offer a destructive discard action on the reading page.

#### Scenario: Author with an in-progress evolution reads the story
- **WHEN** the author opens the reading page of a story that has an unfinished evolution session
- **THEN** one quiet inline line under the title links to resume the draft, and no banner or red Discard button appears
