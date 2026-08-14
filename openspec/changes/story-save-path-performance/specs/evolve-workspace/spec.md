## ADDED Requirements

### Requirement: AI operations act on the latest saved content
Every AI operation that reads a story as its starting point — rewrite, evolution draft generation, and context extraction — SHALL use the story's latest saved title and content. It SHALL NOT use content captured at an earlier version boundary when newer saved text exists.

#### Scenario: Entering Evolve straight from an editing session
- **WHEN** an author edits a story on the Edit page and then opens the AI workspace without any intervening pause
- **THEN** the AI operates on the text the author just wrote, not on the story's state at an earlier point

#### Scenario: Rewrite after a session that has not yet closed
- **WHEN** an author requests a rewrite while their most recent edits belong to an editing session that has not yet been captured as a version
- **THEN** the rewrite is based on those most recent edits
