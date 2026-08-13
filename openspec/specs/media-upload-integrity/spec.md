# media-upload-integrity

## Purpose

Integrity and access-control requirements for local-storage media routes,
covering authentication on upload/serve paths, containment of resolved
paths within the configured media root, and server-side verification of
uploaded object size against declared and allowed limits.

## Requirements

### Requirement: Local media storage routes require authentication
The system SHALL require a valid authenticated session for both the local-storage media upload route (`PUT /media/{path}`) and the local-storage media serve route (`GET /media/{path}`), regardless of `STORAGE_BACKEND` mode.

#### Scenario: Unauthenticated upload to local storage is rejected
- **WHEN** a request without a valid session cookie calls `PUT /media/{path}` while `STORAGE_BACKEND=local`
- **THEN** the system SHALL reject the request with an authentication error and SHALL NOT write any file

#### Scenario: Unauthenticated read from local storage is rejected
- **WHEN** a request without a valid session cookie calls `GET /media/{path}` while `STORAGE_BACKEND=local`
- **THEN** the system SHALL reject the request with an authentication error and SHALL NOT return file contents

#### Scenario: Authenticated request to local storage succeeds
- **WHEN** a request with a valid session cookie calls `PUT /media/{path}` or `GET /media/{path}` while `STORAGE_BACKEND=local`
- **THEN** the system SHALL process the request as before (write or serve the file), subject to the path-containment requirement below

### Requirement: Local media storage paths cannot escape the media root
The system SHALL resolve every requested local-storage path against the configured media root directory and SHALL reject any path whose resolved location is not contained within that root, using containment logic that cannot be defeated by a resolved path that merely shares the root's string prefix (e.g. a sibling directory).

#### Scenario: Path that resolves outside the media root is rejected
- **WHEN** a local-storage request supplies a path that, once resolved, points to a location outside the configured media root (including a sibling directory whose name starts with the same prefix as the media root)
- **THEN** the system SHALL reject the request with a client error and SHALL NOT read or write any file

#### Scenario: Path that resolves inside the media root is accepted
- **WHEN** a local-storage request supplies a path that, once resolved, points to a location inside the configured media root
- **THEN** the system SHALL proceed with the requested read or write operation

### Requirement: Uploaded media size is verified against the declared and allowed size
The system SHALL verify, at upload-confirmation time, that the actual size of the stored object matches the size the client declared at presign time and does not exceed the configured maximum upload size, independent of the client-supplied `size_bytes` value used during presign validation.

#### Scenario: Confirming an upload whose stored object exceeds the maximum allowed size
- **WHEN** a client calls the upload-confirmation endpoint for a media item whose stored object size exceeds the configured maximum upload size
- **THEN** the system SHALL reject the confirmation with a client error, SHALL remove the oversized object from storage, and SHALL NOT mark the media record as confirmed

#### Scenario: Confirming an upload whose stored object is within limits
- **WHEN** a client calls the upload-confirmation endpoint for a media item whose stored object exists and its size is within the configured maximum upload size
- **THEN** the system SHALL mark the media record as confirmed using the actual size read from storage
