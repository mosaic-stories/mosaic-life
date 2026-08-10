# activity-feed-language

## Purpose

How activity feed events are rendered as human-readable sentences from typed (action, entity_type) pairs, and how events without a defined sentence template are excluded from feed responses rather than leaking raw identifiers or filenames.

## Requirements

### Requirement: Activity feed entries render as human sentences
Each activity feed item SHALL be rendered from its typed event (action + entity type) through a human-sentence template naming the actor and the affected legacy or story (e.g. "Sue added a memory to Karen's legacy", "3 photos were added"). The feed SHALL NOT display raw filenames, system identifiers, or untemplated technical strings.

#### Scenario: Story creation renders as a sentence
- **WHEN** a member creates a story on a legacy
- **THEN** the activity feed shows a sentence naming the member and the legacy, not the story's raw title or internal identifiers

#### Scenario: No raw filenames in the feed
- **WHEN** a user uploads a file such as "Screenshot 2026-05-17 at 12.16.55 AM.png"
- **THEN** the activity feed never displays that filename verbatim

### Requirement: Events without a sentence template are excluded from the feed
An activity event whose (action, entity_type) pair has no defined sentence template SHALL be dropped from the feed response entirely, rather than rendered with a raw or generic fallback string. Filtering SHALL happen before pagination so that the requested `limit` reflects only feed-worthy items.

#### Scenario: Untemplated media CRUD event is dropped
- **WHEN** a file-level media event occurs that has no human-sentence template
- **THEN** that event does not appear in the activity feed response at all

#### Scenario: Limit counts only templated items
- **WHEN** a user's raw activity history contains a mix of templated and untemplated events and the client requests `limit=10`
- **THEN** the response contains up to 10 templated items, with untemplated events excluded from that count
