# ai-prompt-safety

## Purpose

Prompt-injection and content-safety requirements for AI system prompts built
from member-submitted content, covering how shared facts are labeled as
untrusted data and bounded in size before being injected into a persona's
system prompt.

## Requirements

### Requirement: Shared facts are labeled as untrusted data in AI system prompts
When a legacy's shared facts are injected into an AI persona's system prompt, the system SHALL present that content within an explicit delimiter that labels it as member-submitted information to be treated as data, not as instructions to the AI.

#### Scenario: System prompt clearly separates shared facts from instructions
- **WHEN** the system builds a system prompt that includes one or more shared `LegacyFact` entries
- **THEN** the resulting prompt SHALL wrap the shared-facts content in a distinct, labeled section that instructs the model to treat the content as information only and never as instructions

### Requirement: Shared fact content is length-capped before prompt injection
The system SHALL truncate each fact's content to a fixed maximum length before including it in an AI system prompt.

#### Scenario: An overly long fact is truncated before being added to the prompt
- **WHEN** a `LegacyFact`'s content exceeds the configured maximum length
- **THEN** the system SHALL include only the truncated content, up to the configured maximum length, in the generated system prompt
