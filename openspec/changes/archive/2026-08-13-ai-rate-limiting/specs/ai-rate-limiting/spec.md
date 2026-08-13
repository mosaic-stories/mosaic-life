## ADDED Requirements

### Requirement: Per-user request-frequency limiting on LLM-invoking endpoints
The system SHALL limit how often an authenticated user may call an endpoint that invokes an LLM, scoped per user (not per IP, not global), across the following endpoints: sending a chat message, seeding a conversation's opening message, requesting a story rewrite, triggering story context extraction, and generating or revising a story-evolution draft. Limits are evaluated independently per endpoint group (e.g. a user hitting the story-rewrite limit is not blocked from sending chat messages).

#### Scenario: User stays under the frequency limit
- **WHEN** an authenticated user calls an LLM-invoking endpoint fewer times than the configured threshold within the configured time window
- **THEN** the request proceeds normally with no rate-limit rejection

#### Scenario: User exceeds the frequency limit
- **WHEN** an authenticated user calls an LLM-invoking endpoint more times than the configured threshold within the configured time window
- **THEN** the system rejects the request with `429 Too Many Requests` and does not invoke the LLM

#### Scenario: Frequency limit is scoped per user
- **WHEN** two different authenticated users each call the same LLM-invoking endpoint below their own individual thresholds
- **THEN** neither user's requests are rejected because of the other user's activity

### Requirement: Per-user concurrency limiting on in-flight LLM operations
The system SHALL limit the number of LLM operations a single authenticated user may have in flight at the same time, across the same endpoint set as the frequency limit. Requests beyond the concurrency limit are rejected rather than queued.

#### Scenario: User opens a new stream while under the concurrency limit
- **WHEN** an authenticated user starts a new LLM operation and has fewer than the configured limit already in flight
- **THEN** the operation proceeds normally

#### Scenario: User opens more concurrent streams than allowed
- **WHEN** an authenticated user attempts to start a new LLM operation while already at the configured concurrent-operation limit
- **THEN** the system rejects the new request with `429 Too Many Requests` and does not invoke the LLM for it, while the user's already-in-flight operations continue unaffected

#### Scenario: A completed or aborted operation frees its concurrency slot
- **WHEN** an in-flight LLM operation finishes — whether it completes successfully, fails with an error, or is aborted by the client disconnecting — its concurrency slot is released
- **THEN** the user may immediately start a new LLM operation up to the concurrency limit again

### Requirement: Rate-limit rejection response contract
When a request is rejected for exceeding either the frequency limit or the concurrency limit, the system SHALL respond with HTTP `429 Too Many Requests` and a `Retry-After` header indicating how many seconds the client should wait before retrying.

#### Scenario: Frequency-limited response includes Retry-After
- **WHEN** a request is rejected for exceeding the frequency limit
- **THEN** the response has status `429` and includes a `Retry-After` header with a positive integer number of seconds

#### Scenario: Concurrency-limited response includes Retry-After
- **WHEN** a request is rejected for exceeding the concurrency limit
- **THEN** the response has status `429` and includes a `Retry-After` header with a positive integer number of seconds
