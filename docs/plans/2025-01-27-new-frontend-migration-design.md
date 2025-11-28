# New Frontend Migration Design

**Date:** 2025-01-27
**Status:** Approved
**Goal:** Replace existing frontend with new Figma-based design, connecting to existing backend APIs

## Summary

Migrate the Figma-designed frontend (`new-frontend/`) to replace the existing `apps/web/` implementation. Add React Router for URL-based navigation, integrate with existing backend APIs, and use mock data with visual indicators for features without backend support.

## Decisions

1. **Routing:** React Router with URL-based navigation (not view-state)
2. **Migration:** Fresh start - clear `apps/web/` and rebuild
3. **Unimplemented features:** Mock data with "Demo data" badge indicator

## Technology Stack

### Keep from new frontend:
- `@radix-ui/*` - All UI primitives
- `lucide-react` - Icons
- `tailwind-merge`, `clsx`, `class-variance-authority` - Styling utilities
- `react-hook-form` - Form handling
- `sonner` - Toast notifications
- `recharts` - Charts (if needed)

### Add for integration:
- `react-router-dom` - URL-based routing
- `@tanstack/react-query` - Server state management
- `zod` - Schema validation

### Keep from existing setup:
- Vite config structure (proxy to backend, CSP headers)
- Vitest + Playwright test configurations
- TypeScript strict mode

## Route Structure

### Public routes (no auth required):
| Path | Component | Description |
|------|-----------|-------------|
| `/` | Homepage | Landing page |
| `/about` | About | About the platform |
| `/how-it-works` | HowItWorks | Onboarding guide |
| `/explore` | ExploreMinimal | Public legacy discovery |
| `/community` | Community | Community showcase |
| `/legacy/:id` | LegacyProfile | Public legacy view |

### Protected routes (auth required):
| Path | Component | Description |
|------|-----------|-------------|
| `/my-legacies` | MyLegacies | User's legacies dashboard |
| `/legacy/:id/edit` | LegacyProfile | Legacy editing (creator only) |
| `/legacy/:id/story/new` | StoryCreation | Create new story |
| `/legacy/:id/story/:storyId` | StoryCreation | View/edit story |
| `/legacy/:id/gallery` | MediaGallery | Media gallery |
| `/legacy/:id/ai-chat` | AIAgentChat | AI assistant |

### Auth routes:
| Path | Description |
|------|-------------|
| `/auth/callback` | Google OAuth callback handler |

## Backend Integration

### Connected to existing APIs:
| Feature | Endpoint | Method |
|---------|----------|--------|
| Google OAuth login | `/api/auth/google` | GET (redirect) |
| Get current user | `/api/me` | GET |
| Logout | `/api/auth/logout` | POST |
| List user's legacies | `/api/legacies/` | GET |
| Create legacy | `/api/legacies/` | POST |
| Get legacy details | `/api/legacies/:id` | GET |
| Update legacy | `/api/legacies/:id` | PUT |
| Delete legacy | `/api/legacies/:id` | DELETE |
| Search legacies | `/api/legacies/search?q=` | GET |
| List stories | `/api/stories/?legacy_id=` | GET |
| Create story | `/api/stories/` | POST |
| Get story | `/api/stories/:id` | GET |
| Update story | `/api/stories/:id` | PUT |
| Delete story | `/api/stories/:id` | DELETE |

### Mock data with Demo badge:
| Feature | Notes |
|---------|-------|
| AI Agent Chat | No AI endpoint - mock responses |
| Media Gallery | No media upload - mock images |
| Community/Explore | Public discovery mock data |
| Theme persistence | localStorage only |
| User profile editing | No endpoint exists |

## File Structure

```
apps/web/
├── src/
│   ├── components/
│   │   ├── ui/              # Radix UI primitives
│   │   ├── figma/           # ImageWithFallback utility
│   │   ├── DemoBadge.tsx    # "Demo data" indicator
│   │   ├── AuthModal.tsx
│   │   ├── Homepage.tsx
│   │   ├── LegacyProfile.tsx
│   │   ├── MyLegacies.tsx
│   │   ├── StoryCreation.tsx
│   │   └── *Minimal.tsx     # Minimal view variants
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts    # Base fetch wrapper
│   │   │   ├── auth.ts      # Auth API functions
│   │   │   ├── legacies.ts  # Legacy CRUD
│   │   │   └── stories.ts   # Story CRUD
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useLegacies.ts
│   │   │   └── useStories.ts
│   │   ├── mockData.ts      # Mock data for demo features
│   │   ├── themes.ts        # Theme definitions
│   │   └── themeUtils.ts    # Theme application
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── routes/
│   │   ├── index.tsx        # Route definitions
│   │   └── ProtectedRoute.tsx
│   ├── App.tsx              # Router + providers
│   ├── main.tsx             # Entry point
│   └── index.css            # Tailwind + theme CSS
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Implementation Phases

### Phase 1: Foundation
1. Clear `apps/web/` and copy new frontend source
2. Merge package.json dependencies
3. Update Vite config (keep proxy, add aliases)
4. Add React Router with route definitions
5. Create AuthContext connecting to `/api/me`
6. Verify app renders and routes work

### Phase 2: Auth Integration
1. Update AuthModal to redirect to `/api/auth/google`
2. Handle OAuth callback and session
3. Add ProtectedRoute wrapper component
4. Connect sign-out to `/api/auth/logout`

### Phase 3: Legacy & Story Integration
1. Create API client functions
2. Add TanStack Query hooks
3. Connect MyLegacies to real API
4. Connect LegacyProfile to real API
5. Connect StoryCreation to real API
6. Wire up search functionality

### Phase 4: Mock Features
1. Create `<DemoBadge>` component
2. Apply to AI Chat, Media Gallery, Community
3. Keep mock data flowing with clear labeling
