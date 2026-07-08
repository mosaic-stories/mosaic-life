# legacy-access

## Purpose

Who can see a legacy, the membership role hierarchy, and how users become members. A legacy has a visibility scope and a set of members, each holding exactly one canonical role.

## Requirements

### Requirement: Legacy visibility scopes
A legacy SHALL have exactly one visibility scope: `public` or `private`, defaulting to `private`. Only a member with role `creator` SHALL change it. The API SHALL reject any other value, and the database SHALL refuse to store one.

#### Scenario: Non-creator cannot change visibility
- **WHEN** an `admin` member updates a legacy's visibility
- **THEN** the API responds 403 and the visibility is unchanged

#### Scenario: Invalid scope rejected
- **WHEN** a client sets a legacy's visibility to `unlisted`
- **THEN** the API responds 422

### Requirement: Public legacy access
A `public` legacy SHALL be viewable by anyone, including unauthenticated visitors, and SHALL be eligible for explore and search results.

#### Scenario: Unauthenticated visitor views public legacy
- **WHEN** an unauthenticated client requests a `public` legacy's public detail
- **THEN** the legacy profile is returned

### Requirement: Private legacy access
A `private` legacy's detail SHALL be viewable only by its non-pending members. Non-members SHALL receive 403 and MAY be offered the access-request flow. Private legacies SHALL appear in explore/search results only for their members.

#### Scenario: Non-member denied
- **WHEN** an authenticated non-member requests a `private` legacy's detail
- **THEN** the API responds 403

#### Scenario: Private legacy hidden from explore
- **WHEN** a user who is not a member browses explore
- **THEN** `private` legacies they do not belong to are absent from the results

### Requirement: Canonical membership roles
Membership roles SHALL be exactly `creator`, `admin`, `advocate`, `admirer`, ordered by that hierarchy. The database SHALL refuse to store any other role value. Every membership SHALL be active — provisional states are represented by invitations or access requests, never by a membership row.

#### Scenario: Non-canonical role rejected at the database
- **WHEN** any write attempts to store a membership role outside the four canonical values (e.g. `pending`, `member`)
- **THEN** the write fails with a constraint violation

### Requirement: Role management rules
A member SHALL be able to assign, invite at, or remove only roles at or below their own level; `admirer` SHALL manage no one. Role changes and removals SHALL be restricted to `creator` and `admin`. The last remaining `creator` SHALL NOT be demoted or removed.

#### Scenario: Admin cannot promote to creator
- **WHEN** an `admin` attempts to change a member's role to `creator`
- **THEN** the API responds 403

#### Scenario: Last creator protected
- **WHEN** the only `creator` attempts to leave the legacy or demote themselves
- **THEN** the API responds 400 and the membership is unchanged

### Requirement: Invitations
A member SHALL be able to invite a user (by account or email) at any role at or below their own level, subject to the role management rules. An invitation SHALL carry a single-use token that expires after 7 days. Accepting a valid invitation SHALL create a membership at the invited role; expired or revoked tokens SHALL grant nothing.

#### Scenario: Acceptance creates membership
- **WHEN** an invited user accepts an unexpired, unrevoked invitation for role `advocate`
- **THEN** they become an `advocate` member of the legacy

#### Scenario: Expired invitation rejected
- **WHEN** a user accepts an invitation more than 7 days after it was created
- **THEN** the API rejects it and no membership is created

### Requirement: Access requests are the single join mechanism
A user SHALL join a legacy they were not invited to only through an access request stating a requested role. Only `creator` and `admin` members SHALL list, approve, or decline requests. Approval SHALL create a membership at the assigned (or requested) role; no other self-serve join path SHALL exist.

#### Scenario: Approval creates membership
- **WHEN** an `admin` approves an access request, assigning role `admirer`
- **THEN** the requester becomes an `admirer` member

#### Scenario: Obsolete join endpoint removed
- **WHEN** a client calls `POST /api/legacies/{id}/join`
- **THEN** the API responds 404 (route no longer exists)

#### Scenario: Non-admin cannot resolve requests
- **WHEN** an `advocate` attempts to approve or decline an access request
- **THEN** the API responds 403
