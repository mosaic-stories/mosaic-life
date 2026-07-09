## Why

Stories cannot be answered: a member who reads a memory has no way to comment or react, so the read page is a dead end and the notification/activity systems have nothing story-level to circulate. This closes that loop and adds a structural moment to convert single-player legacies into invited networks.

## What Changes

- Members of a legacy can leave a flat-list, plain-text written response ("Add what you remember…") on a story they can read; authors can edit their own response in place (with an "edited" marker) or delete it.
- Members can react to a story with one of three fixed, register-appropriate reactions — Heart, Candle, Smile (lucide icons) — one per type per user, toggleable, with counts shown on the story and on story cards.
- The story author and legacy members are notified (in-app only, via the existing notification pipeline) when a story receives a response or reaction; responders are notified of later responses on the same story ("also responded", no threading).
- Story author and legacy creator/admin can remove any response; advocates cannot. Only legacy members may respond or react — visibility does not extend to public non-member viewers.
- After a legacy's first story publish (or legacy creation), a dismissible full-card prompt invites the owner to add the people who knew the subject, opening the existing `InviteMemberModal`; dismissal persists per legacy.
- Activity feed entries are rendered from typed events through human-sentence templates (e.g. "Sue added a memory to Karen's legacy"); events with no sentence template (raw file/media CRUD) are dropped from the feed instead of leaking system identifiers.
- New backend surface: `story_responses` and `story_reactions` tables and CRUD endpoints under the story resource, cursor-paginated, following existing error-envelope conventions, with notification fan-out on create.

## Capabilities

### New Capabilities
- `story-responses`: Members writing/editing/deleting flat-list responses and toggling fixed reactions on a story; response/reaction counts on the read page and story cards; membership-gated read/write; author/admin removal rights; in-app notification fan-out on response and reaction.
- `legacy-invite-moment`: A dismissible, per-legacy-persisted invite prompt shown after a legacy's first story publish (or legacy creation), linking to the existing invite flow.
- `activity-feed-language`: Activity feed entries rendered as human-readable sentences from typed events; events without a sentence template are excluded from the feed rather than shown raw.

### Modified Capabilities
(none — `story-reading` already reserves the surface below the story body for this change; no existing requirement text changes)

## Impact

- **Backend** (`services/core-api`): new SQLAlchemy models + Alembic migrations for `story_responses` and `story_reactions`; new CRUD/toggle endpoints under the story resource; notification fan-out hooks into the existing notification pipeline (`features` equivalent on the backend); story serializers gain response/reaction counts.
- **Frontend** (`apps/web`): new responses section and reactions row on the Read page (`features` for story reading, per Spec 01/`story-reading`); story card components gain count badges; new invite-moment prompt card wired to the existing `InviteMemberModal` (`features/members/`); `features/activity/` templates and event filtering updated.
- **Notifications**: reuses the existing in-app notification pipeline (`features/notifications/`); no new email path in this change.
- Depends on the story Read page from the `story-lifecycle-split` change (archived at `openspec/changes/archive/2026-07-09-story-lifecycle-split/`), which already renders the plain reading surface these sections attach to.

## Open Questions

All open questions from the source design review (`docs/design/2026-07-ui-review/specs/02-story-responses.md`) were resolved by the owner before this proposal was written:

1. **Who may respond/react?** → Legacy members only (creator/admin/advocate/admirer); not extended to public non-member viewers.
2. **Reaction set?** → Confirmed as Heart / Candle / Smile, unchanged from the source review.
3. **Response editing?** → Authors may edit their response in place, shown with an "edited" marker; not delete-and-rewrite only.
4. **Removal rights?** → Story author and legacy creator/admin can remove any response; advocates cannot.
5. **Email notifications?** → In-app only for MVP (assumption, not escalated as blocking); reuse the existing notification pipeline, no new email path.

No open questions remain blocking `apply`.
