# Spec 02: Story Responses — Comments, Reactions, and the Invite Moment

**Status:** SEED — awaiting owner second pass
**Priority:** P1 (highest-value new feature)
**Evidence:** [`../00-review-summary.md`](../00-review-summary.md) §B · screenshots `30-legacy-detail.jpg`, `11-my-overview.jpg`
**Depends on:** Spec 01 (responses render on the new Read page); backend API work (new endpoints)
**Blocks:** nothing

## Context capsule

Mosaic Life is a memorial-stories platform. A "legacy" memorializes a person; members hold roles (creator/admin/advocate/admirer). Social plumbing already exists and works: invitations (`features/members/`, `/invite/:token`), user connections (`features/user-connections/`), notifications (`features/notifications/`), an activity feed (`features/activity/`), favorites. The backend is a single FastAPI service (`services/core-api`) with PostgreSQL; frontend is React + TanStack Query.

## Problem

**Stories cannot be answered.** A family member who reads a memory has no way to respond — no comment, no reaction. The read page is a dead end, so notifications and the activity feed have nothing story-level to circulate, and the "social network aspect" has no loop. Secondary problems: the invite affordance is buried in the legacy sidebar with no structural moment prompting it, and the activity feed emits raw system events ("You created 'Screenshot 2026-05-17 at 12.16.55 AM.png'").

## Goals

- Members can leave a written response on a story, framed in the memorial register ("Add what you remember"), not generic comments.
- Members can react with a small, fixed, register-appropriate set.
- Story authors and legacy members are notified of responses through the existing notification system.
- A structural invite moment after first publish converts single-player usage into the network.
- Activity feed entries are human sentences about meaningful events.

## Non-goals

- Threaded/nested replies (flat list first).
- Reactions on comments, @-mentions, rich text in responses (plain text + line breaks first).
- Public commenting by non-members (visibility follows story visibility; only members respond — see Q1).
- Moderation tooling beyond author/creator delete (see Q4).
- Real-time updates (poll/invalidate via TanStack Query is fine for MVP).

## Proposed direction

**Responses.** Below the story body on the Read page: a "Memories & responses" section. Input placeholder: "Add what you remember…". Flat list, newest last, avatar + name + relative time. A response that grows long gets a gentle inline offer: "This sounds like its own story — want to save it as one?" (pre-seeds spec 01's Edit page with the text, linked to the same legacy).

**Reactions.** Three fixed reactions rendered as drawn icons (lucide, not emoji): **Heart** ("Love this"), **Candle** ("Lighting a candle"), **Smile** ("This made me smile"). Shown with counts on the Read page and story cards; one of each type per user, toggleable.

**Notifications.** Reuse the existing notification pipeline: story author notified of responses/reactions; responders notified of replies after theirs (simple "also responded" model, no threading).

**Invite moment.** After a story's first publish (and after legacy creation), a dismissible full-card prompt: "Karen's page is ready. Invite the people who knew her." → existing `InviteMemberModal`. Dismissal persists per legacy.

**Activity feed language.** Feed items rendered from typed events with human templates: "Sue added a memory to Karen's legacy", "3 photos were added". Events that can't be phrased that way (file-level media CRUD) are dropped from the feed.

**Backend surface (new):** `story_responses` and `story_reactions` tables + CRUD endpoints under the story resource, following existing SQLAlchemy/Alembic patterns; notification fan-out on create. Cursor pagination per API standards.

## Open questions (owner second pass)

1. **Who may respond/react?** Legacy members only, or anyone who can view a public story? (Members-only is safer for launch and matches the grief register.)
   → Decision:
2. **Reaction set.** Confirm the three (heart / candle / smile), or adjust? Candle is the most "memorial" but skews somber for living legacies (retirements, graduations).
   → Decision:
3. **Response editing.** Allow authors to edit their responses (with "edited" marker), or delete-and-rewrite only?
   → Decision:
4. **Removal rights.** Story author and legacy creator/admin can remove any response? Advocates too?
   → Decision:
5. **Email notifications.** In-app only for MVP, or is there an email path worth wiring now?
   → Decision:

## Acceptance criteria

- [ ] A member reading a story can submit a response without leaving the page and sees it appear immediately.
- [ ] Reactions toggle per user per type; counts update optimistically and reconcile.
- [ ] Story author receives an in-app notification naming the responder and the story ("Sue responded to 'The Fenway lunch'").
- [ ] Response counts appear on story cards (hubs, legacy page) alongside existing metadata.
- [ ] After first publish on a legacy with 1 member, the invite prompt appears; dismissing it persists.
- [ ] Activity feed contains no raw filenames or system identifiers.
- [ ] All new endpoints follow the error-envelope and cursor-pagination conventions; `just validate-backend` passes.

## Suggested PR breakdown (<400 LOC each)

1. **Backend: responses** — model, migration, CRUD endpoints, notification fan-out, tests.
2. **Backend: reactions** — model, migration, toggle endpoint, counts in story serializers, tests.
3. **Frontend: responses UI** — section on Read page, input, list, delete; TanStack Query hooks.
4. **Frontend: reactions UI** — toggle row on Read page + counts on story cards.
5. **Invite moment** — post-publish/post-create prompt card wired to `InviteMemberModal`; per-legacy dismissal.
6. **Activity feed language** — human templates + event filtering. (`features/activity/`)
7. *(Optional)* **"Save as story" upgrade** from a long response → seeds Edit page.
