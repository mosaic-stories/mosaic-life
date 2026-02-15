# Legacy Member Invitations Design

**Date:** 2025-01-29
**Status:** Approved
**Author:** Claude (brainstorming session)

## Overview

This design introduces a hierarchical membership system with email invitations for legacies. It allows legacy creators to invite family and friends to view or contribute to memorial stories at appropriate permission levels.

## Goals

- Enable creators to invite others via email to join a legacy
- Provide four permission tiers: creator, admin, advocate, admirer
- Allow hierarchical management (users can only manage roles at or below their level)
- Show member list with management controls for authorized users
- Ensure legacies always have at least one creator

## Role Model

### Four-Tier Hierarchy

| Role | Level | Capabilities |
|------|-------|--------------|
| **Creator** | 4 | Delete legacy, promote admins to creator, all admin powers |
| **Admin** | 3 | Remove/demote members (admin and below), change roles, invite (admin and below), edit legacy details, delete stories/media |
| **Advocate** | 2 | Create/edit own stories and media, invite (advocate and below), view all content |
| **Admirer** | 1 | View stories and media only, cannot invite |

### Invitation Permissions

| Role | Can Invite |
|------|------------|
| Creator | creator, admin, advocate, admirer |
| Admin | admin, advocate, admirer |
| Advocate | advocate, admirer |
| Admirer | (nobody) |

### Management Permissions

| Action | Who Can Perform |
|--------|-----------------|
| View member list | All members |
| Change roles | Creators and admins (for roles at or below their level) |
| Remove members | Creators and admins (for roles at or below their level) |
| View pending invites | Creators and admins |
| Revoke invites | Creators and admins |

### Key Rules

- The person who creates a legacy starts as creator
- Creators can promote admins to creator
- Users can only manage (remove, demote, invite) roles at or below their own level
- Anyone can leave, but the last creator cannot leave (must promote someone first)
- Self-demotion is allowed (creator to admin, etc.) if role constraints are met
- Re-inviting someone who declined or was removed is allowed

## Invitation System

### Invitation Record

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `legacy_id` | UUID | Which legacy |
| `email` | String | Invitee's email address |
| `role` | String | Role they'll receive upon accepting |
| `invited_by` | UUID | User ID of the inviter |
| `token` | String | Secure random token for the link (64 chars) |
| `created_at` | Timestamp | When the invite was sent |
| `expires_at` | Timestamp | 7 days from creation |
| `accepted_at` | Timestamp | Null until used |
| `revoked_at` | Timestamp | Null unless manually revoked |

### Invitation States

- **Pending** – Sent but not yet accepted (accepted_at and revoked_at both null, not expired)
- **Accepted** – Used successfully (accepted_at is set)
- **Expired** – Past expires_at without acceptance
- **Revoked** – Manually cancelled by creator/admin

### Invitation Flow

1. Creator/admin/advocate enters an email and selects a role (constrained by their level)
2. System creates invitation record and sends email via SES
3. Email contains link: `https://app.mosaiclife.com/invite/{token}`
4. Recipient clicks link, redirected to sign in if not authenticated
5. After sign-in, shown legacy preview (name, profile image, biography, inviter name, invited role)
6. Recipient clicks "Accept" → added as member with invited role, redirected to legacy page
7. If they decline → invitation stays pending (they can revisit until expiration)

### Constraints

- Single-use: once accepted, link returns "already used" message
- Duplicate check: cannot send invite to email with pending invite for same legacy
- Existing member check: cannot invite someone already a member

## API Endpoints

### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/legacies/{id}/invitations` | Required | Send invitation (email, role) |
| `GET` | `/api/legacies/{id}/invitations` | Required | List pending invitations (creators/admins) |
| `DELETE` | `/api/legacies/{id}/invitations/{invitation_id}` | Required | Revoke invitation |
| `GET` | `/api/invitations/{token}` | Required | Get invitation details + legacy preview |
| `POST` | `/api/invitations/{token}/accept` | Required | Accept invitation, become member |
| `GET` | `/api/legacies/{id}/members` | Required | List all members with roles |
| `PATCH` | `/api/legacies/{id}/members/{user_id}` | Required | Change member's role |
| `DELETE` | `/api/legacies/{id}/members/{user_id}` | Required | Remove member |
| `DELETE` | `/api/legacies/{id}/members/me` | Required | Leave legacy (self-removal) |

### Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/api/legacies/{id}` | Include `member_count` and current user's `role` |
| `DELETE` | `/api/legacies/{id}` | Restrict to creator role only |

## Database Schema

### New Table: invitations

```sql
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    CONSTRAINT valid_role CHECK (role IN ('creator', 'admin', 'advocate', 'admirer'))
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_legacy_id ON invitations(legacy_id);
CREATE INDEX idx_invitations_email ON invitations(email);
```

### Modify Table: legacy_members

```sql
-- Update role constraint to new values
ALTER TABLE legacy_members
    DROP CONSTRAINT IF EXISTS legacy_members_role_check;

ALTER TABLE legacy_members
    ADD CONSTRAINT legacy_members_role_check
    CHECK (role IN ('creator', 'admin', 'advocate', 'admirer'));
```

### Data Migration

Map existing roles to new roles:
- `creator` → `creator` (no change)
- `editor` → `admin`
- `member` → `advocate`
- `pending` → delete (these were join requests, not invitations)

## Frontend Components

### New Components

1. **MemberDrawer** (`apps/web/src/features/legacy/components/MemberDrawer.tsx`)
   - Slide-out drawer triggered by clicking member count
   - Shows all members with avatar, name, role badge, joined date
   - For creators/admins: role dropdown, remove button per member
   - "Pending Invites" section with email, invited role, inviter, revoke button
   - "Invite Member" button opens invite modal

2. **InviteMemberModal** (`apps/web/src/features/legacy/components/InviteMemberModal.tsx`)
   - Email input field
   - Role selector dropdown (filtered by current user's role level)
   - Send button calls POST `/api/legacies/{id}/invitations`
   - Success toast: "Invitation sent to {email}"

3. **InviteAcceptPage** (`apps/web/src/pages/InviteAcceptPage.tsx`)
   - Route: `/invite/:token`
   - If not authenticated, redirect to Google sign-in with return URL
   - Shows legacy preview: profile image, name, dates, biography snippet
   - Shows: "You've been invited by {inviter} to join as {role}"
   - "Accept & Join" button, "Decline" link
   - Error states: expired, already used, revoked

4. **LeaveButton** (within MemberDrawer)
   - "Leave Legacy" action for non-creators
   - For creators: disabled if last creator

### Modified Components

- **LegacyProfile.tsx** – Member count becomes clickable, opens MemberDrawer
- **Role badges** – Update to show new role names

## Email Template

**Subject:** You're invited to join {legacy_name} on Mosaic Life

**Body:**
```
Hi,

{inviter_name} has invited you to join "{legacy_name}" as {role} on Mosaic Life.

Mosaic Life is a platform for creating and preserving memorial stories
and memories of loved ones.

Click below to view this legacy and accept the invitation:

[View Invitation]  →  https://app.mosaiclife.com/invite/{token}

This invitation expires in 7 days.

---
Mosaic Life
```

### SES Integration

- New service: `app/services/email.py`
- Uses boto3 SES client
- Configuration: `SES_REGION`, `SES_FROM_EMAIL` env vars
- Local dev: Log email content to console instead of sending
- If SES send fails, invitation record is still created (admin can share link manually)

## Implementation Order

1. Database migration – Add invitations table, update legacy_members roles
2. Backend models – Invitation SQLAlchemy model, update LegacyMember role enum
3. Email service – SES integration with invitation template
4. Backend API – Invitation endpoints, member management endpoints, permission checks
5. Frontend: MemberDrawer – Member list with role management UI
6. Frontend: InviteMemberModal – Send invitation form
7. Frontend: InviteAcceptPage – Token validation, preview, accept flow
8. Frontend: LegacyProfile updates – Clickable member count, role badges
9. Testing – Unit tests for permission logic, integration tests for invitation flow

## Files to Create/Modify

| Type | Path |
|------|------|
| Migration | `services/core-api/alembic/versions/xxx_add_invitations.py` |
| Model | `services/core-api/app/models/invitation.py` |
| Service | `services/core-api/app/services/email.py` |
| Service | `services/core-api/app/services/invitation.py` |
| Routes | `services/core-api/app/routes/invitation.py` |
| Routes | `services/core-api/app/routes/legacy.py` (modify) |
| Component | `apps/web/src/features/legacy/components/MemberDrawer.tsx` |
| Component | `apps/web/src/features/legacy/components/InviteMemberModal.tsx` |
| Page | `apps/web/src/pages/InviteAcceptPage.tsx` |
| Hooks | `apps/web/src/lib/api/invitations.ts` |

## Out of Scope (Deferred)

- Email address verification/matching
- Notification preferences (email opt-out)
- Activity log / audit trail
- Bulk invitations
- Resend invitation feature
