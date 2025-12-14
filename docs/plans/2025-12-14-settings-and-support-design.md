# Settings Page & Help Support Design

**Date:** 2025-12-14
**Status:** Approved
**Author:** Brainstorming Session

## Overview

Redesign of the user profile dropdown menu and implementation of a comprehensive Settings page with Help & Support functionality. This consolidates "My Profile" into Settings for a cleaner user experience.

## Goals

1. Simplify the profile dropdown menu by removing separate "My Profile" entry
2. Create a full-featured Settings page with vertical sidebar navigation
3. Implement Help & Support dialog with automatic context capture
4. Persist user preferences (theme, AI settings) to backend with localStorage cache

## Non-Goals

- Billing section (deferred to future phase)
- Token usage tracking (separate feature)
- Screenshot capture in support dialog

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Profile + Settings | Combined into single "Settings" | Simpler menu, industry standard (GitHub, Notion, Discord) |
| Settings layout | Vertical sidebar | Scales well with 5 sections, standard pattern |
| Theme persistence | Backend + localStorage cache | Cross-device sync with fast local loading |
| Support context | Moderate capture | Useful debugging info without screenshot complexity |
| Support delivery | Backend API + email | Enables validation, rate limiting, future ticket system |
| AI preferences | Model dropdown + persona toggles | User control without overwhelming options |

---

## 1. Updated Dropdown Menu

### Component
Update `HeaderUserMenu.tsx`

### Structure
```
┌─────────────────────────────────┐
│  NOTIFICATIONS                  │
│  ┌───────────────────────────┐  │
│  │ [Notification 1]          │  │
│  │ [Notification 2]          │  │
│  │ [Notification 3]          │  │
│  └───────────────────────────┘  │
│  [Mark all read]  [View all →]  │
├─────────────────────────────────┤
│  (avatar)  John Doe             │
│            john@example.com     │
├─────────────────────────────────┤
│  📚  My Legacies                │
│  ⚙️   Settings                  │
│  ❓  Help & Support             │
├─────────────────────────────────┤
│  🚪  Sign Out                   │
└─────────────────────────────────┘
```

### Changes from Current
- **Remove:** "My Profile" menu item (now under Settings > Profile)
- **Keep:** Notifications preview, My Legacies, Sign Out (all working)
- **Update:** "Settings" navigates to new `/settings` route
- **Update:** "Help & Support" opens dialog (not navigation)

---

## 2. Settings Page Layout

### Routes
- `/settings` → redirects to `/settings/profile`
- `/settings/profile` → Profile section
- `/settings/appearance` → Appearance section
- `/settings/ai` → AI Preferences section
- `/settings/usage` → Usage & Stats section
- `/settings/account` → Account section

### Layout
```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Home                              Settings        │
├────────────────┬─────────────────────────────────────────────┤
│                │                                             │
│  ○ Profile     │   Section Title                             │
│  ○ Appearance  │   ─────────────────                         │
│  ○ AI Prefs    │                                             │
│  ○ Usage       │   [Section content here]                    │
│  ○ Account     │                                             │
│                │                                             │
├────────────────┴─────────────────────────────────────────────┤
```

### Responsive Behavior
- Desktop: Persistent sidebar on left
- Mobile: Sidebar collapses to horizontal tabs at top, or section list with drill-down navigation

---

## 3. Profile Section

**Route:** `/settings/profile`

### Fields
| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| Avatar | Image upload | Max 5MB, square recommended | Stored in S3 |
| Display Name | Text | Required, 1-100 chars | |
| Email | Text (readonly) | N/A | Shows OAuth provider info |
| Bio | Textarea | Optional, max 500 chars | |

### Behavior
- Save button enabled only when changes exist
- Avatar upload shows preview before saving
- Form validates on blur and submit
- Email field shows "Managed by Google" for OAuth users

---

## 4. Appearance Section

**Route:** `/settings/appearance`

### Theme Options (15 themes, 3 categories)

**Classic:**
- Warm Amber - "Hopeful and welcoming"
- Serene Blue - "Calm and peaceful"
- Gentle Rose - "Soft and loving"
- Forest Green - "Natural and grounded"
- Twilight Purple - "Contemplative and spiritual"
- Deep Navy - "Professional and trustworthy"

**Muted:**
- Muted Sage - "Subtle and sophisticated"
- Muted Lavender - "Gentle and refined"
- Muted Seafoam - "Cool and understated"
- Muted Clay - "Earthy and warm"

**Vibrant:**
- Vibrant Coral - "Bold and energetic"
- Vibrant Ocean - "Bright and refreshing"
- Vibrant Sunset - "Warm and lively"
- Vibrant Lime - "Fresh and dynamic"
- Navy Gradient - "Bold navy to bright blue"

### Behavior
- Clicking theme applies immediately (no save button)
- Checkmark indicates current selection
- Description shown on hover or below selected theme
- Changes save to backend (debounced) AND localStorage

### Data Flow
1. On page load: display current theme from state
2. On click: `applyTheme()` → update localStorage → fire API call
3. On login: fetch user preferences → override localStorage → apply theme

### API
```
PATCH /api/users/me/preferences
{ "theme": "warm-amber" }
```

---

## 5. AI Preferences Section

**Route:** `/settings/ai`

### Default Model Selection

| Model | Description |
|-------|-------------|
| Claude Opus 4.5 | Most capable - Deep reasoning and nuance |
| Claude Sonnet 4.5 | Balanced - Great quality at faster speed |
| Claude Haiku 4.5 | Fast - Quick responses for simple tasks |
| DeepSeek-R1 | Analytical - Strong reasoning and problem-solving |

### Agent Personas

| Persona | Description | Default |
|---------|-------------|---------|
| Biographer | Helps document life events with historical context and narrative flow | ON |
| Friend | Warm, conversational companion for sharing memories and stories | ON |
| (Future personas) | Auto-enabled when added | ON |

### Behavior
- Model dropdown with name + short description per option
- Persona cards with icon, name, description, toggle switch
- Hidden personas don't appear in AI chat persona picker
- New personas default to visible (ON)

### API
```
PATCH /api/users/me/preferences
{
  "default_model": "claude-sonnet-4.5",
  "hidden_personas": ["friend"]
}
```

---

## 6. Usage & Stats Section

**Route:** `/settings/usage`

### Metrics

**Content Metrics:**
| Metric | Description |
|--------|-------------|
| Legacies | Total legacies created |
| Stories | Total stories across all legacies |
| Media Items | Images and videos uploaded |
| Storage Used | Formatted as MB or GB |

**Engagement Metrics:**
| Metric | Description |
|--------|-------------|
| Chat Sessions | Total AI chat sessions |
| Legacy Views | Aggregate views on public legacies |
| Collaborators | Unique contributors across all legacies |
| Member Since | Account creation date with relative time |

### Behavior
- Read-only display (no edit actions)
- Data fetched on page load (not real-time)
- Stat cards use subtle background colors for visual grouping

### API
```
GET /api/users/me/stats

Response:
{
  "member_since": "2025-01-15T00:00:00Z",
  "legacies_count": 3,
  "stories_count": 12,
  "media_count": 47,
  "storage_used_bytes": 268435456,
  "chat_sessions_count": 28,
  "legacy_views_total": 142,
  "collaborators_count": 5
}
```

---

## 7. Account Section

**Route:** `/settings/account`

### Connected Accounts
- Shows Google OAuth connection status
- Indicates primary sign-in method
- Future: ability to link additional OAuth providers

### Active Sessions
| Field | Description |
|-------|-------------|
| Device/Browser | e.g., "Chrome on macOS" |
| Location | Approximate location from IP |
| Status | "Current session" or "Last active X ago" |
| Actions | Revoke button (except current session) |

Bulk action: "Sign out all other sessions"

### Export Your Data
- Button triggers async export job
- User receives email with download link when ready
- Exports: legacies, stories, media URLs, profile, preferences
- GDPR compliance feature

### Delete Account
- Red "danger zone" styling
- Confirmation dialog with typed confirmation (e.g., type "DELETE")
- Warning about permanent data loss
- Requires re-authentication before deletion

### APIs
```
GET /api/users/me/sessions
DELETE /api/users/me/sessions/:id
POST /api/users/me/export
DELETE /api/users/me (with confirmation token)
```

---

## 8. Help & Support Dialog

**Trigger:** "Help & Support" menu item in profile dropdown

### User Input Fields

| Field | Type | Validation |
|-------|------|------------|
| Category | Dropdown | Required |
| Subject | Text | Required, max 100 chars |
| Message | Textarea | Required, max 2000 chars |

**Categories:**
- General Question
- Bug Report
- Feature Request
- Account Issue
- Other

### Auto-Captured Context

| Data | Description |
|------|-------------|
| Page URL | Current route (e.g., `/legacy/abc123/story/new`) |
| Timestamp | ISO format submission time |
| User ID | Internal user identifier |
| User Email | For response delivery |
| Browser/Device | User agent string |
| Legacy ID | If currently viewing a legacy |
| Console Errors | Last 5 errors (if any) |
| Session Duration | Time since login |

### Dialog Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Help & Support                                         ✕   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  How can we help?                                           │
│                                                             │
│  CATEGORY                                                   │
│  [Dropdown: General Question ▼]                             │
│                                                             │
│  SUBJECT                                                    │
│  [Brief description of your issue]                          │
│                                                             │
│  MESSAGE                                                    │
│  [Please describe your issue or question in detail...]      │
│  0/2000 characters                                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ℹ️  We'll automatically include:                   │   │
│  │  • Current page and legacy context                  │   │
│  │  • Browser and device info                          │   │
│  │  • Recent error logs (if any)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                              [Cancel]  [Send Message]       │
└─────────────────────────────────────────────────────────────┘
```

### Behavior
1. Dialog opens as modal overlay
2. Info box explains auto-captured context (transparency)
3. Send button disabled until required fields filled
4. On submit: loading state → API call → success message
5. Success: "Thanks! We'll respond to your email within 24-48 hours."
6. Dialog closes after user acknowledges success

### API
```
POST /api/support/request
{
  "category": "bug_report",
  "subject": "Editor crashes when adding images",
  "message": "When I try to upload an image...",
  "context": {
    "page_url": "/legacy/abc123/story/new",
    "timestamp": "2025-01-15T14:32:00Z",
    "user_agent": "Mozilla/5.0...",
    "legacy_id": "abc123",
    "session_duration_seconds": 2700,
    "recent_errors": ["TypeError: Cannot read property..."]
  }
}
```

### Email Format (sent to support@mosaiclife.me)
```
Subject: [Bug Report] Editor crashes when adding images

From: john.doe@gmail.com (User ID: usr_123)
Category: Bug Report
Submitted: 2025-01-15 14:32:00 UTC

Message:
When I try to upload an image...

--- Context ---
Page: /legacy/abc123/story/new
Legacy ID: abc123
Browser: Chrome 120 on macOS 14.2
Session Duration: 45 minutes
Errors: TypeError: Cannot read property 'x' of undefined (story-editor.ts:142)
```

### Backend Implementation
- Send email via AWS SES
- Store request in `support_requests` table for future ticket system
- Rate limit: 5 requests per hour per user

---

## Database Schema Changes

### User Preferences Table
```sql
-- Add to existing users table or create preferences table
ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}';

-- Example preferences structure:
{
  "theme": "warm-amber",
  "default_model": "claude-sonnet-4.5",
  "hidden_personas": []
}
```

### Support Requests Table
```sql
CREATE TABLE support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  context JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions Table
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  device_info VARCHAR(255),
  ip_address INET,
  location VARCHAR(100),
  last_active_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);
```

---

## New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me/preferences` | Get user preferences |
| PATCH | `/api/users/me/preferences` | Update user preferences |
| GET | `/api/users/me/stats` | Get usage statistics |
| GET | `/api/users/me/sessions` | List active sessions |
| DELETE | `/api/users/me/sessions/:id` | Revoke a session |
| POST | `/api/users/me/export` | Request data export |
| DELETE | `/api/users/me` | Delete account |
| POST | `/api/support/request` | Submit support request |

---

## Frontend Components

### New Components
- `SettingsLayout.tsx` - Settings page with sidebar
- `SettingsSidebar.tsx` - Navigation sidebar
- `ProfileSettings.tsx` - Profile section
- `AppearanceSettings.tsx` - Theme selection (reuses ThemeSelector data)
- `AIPreferencesSettings.tsx` - Model and persona settings
- `UsageStats.tsx` - Statistics display
- `AccountSettings.tsx` - Account management
- `HelpSupportDialog.tsx` - Support request modal
- `SessionCard.tsx` - Active session display
- `StatCard.tsx` - Reusable stat display component

### Modified Components
- `HeaderUserMenu.tsx` - Remove "My Profile", update Help & Support to open dialog
- `RootLayout.tsx` - Add settings routes
- `routes/index.tsx` - Add `/settings/*` routes

---

## Future Considerations

1. **Billing Section:** Add when payment integration is needed
2. **Token Usage:** Add to Usage & Stats when tracking is implemented
3. **Ticket System:** Migrate support requests from email to in-app tickets
4. **Additional OAuth:** Support Apple, Microsoft sign-in
5. **Notification Preferences:** Add email/push notification controls
6. **Accessibility:** Add font size, reduced motion preferences
