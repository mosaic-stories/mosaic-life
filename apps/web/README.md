# Mosaic Life - Web Frontend

MVP frontend application for Mosaic Life, a digital legacy preservation platform.

## Architecture

This is the **MVP implementation** following a simplified architecture:
- Single React application (no Module Federation plugins yet)
- Direct integration with Core API
- Foundation design system with tokens
- Accessibility-first approach (WCAG 2.1 AA)

See `/docs/architecture/FRONTEND-ARCHITECTURE.md` for the full target architecture.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**:
  - Zustand (local UI state)
  - TanStack Query (server state)
- **Styling**: CSS Modules + Design Tokens
- **Editor**: TipTap (Markdown-based)
- **Icons**: (To be added)

## Project Structure

```
src/
├── components/
│   ├── ui/              # Reusable UI components
│   └── layout/          # Layout components
├── pages/               # Page components
├── styles/              # Global styles and tokens
├── lib/                 # Utilities and API clients
│   └── api/            # API client
├── App.tsx             # Main app component
└── main.tsx            # Entry point
```

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
cd apps/web
pnpm install
```

### Development

```bash
pnpm dev
```

The app will start on `http://localhost:5173` with API proxy configured to `http://localhost:8080`.

### Build

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Design System

The application uses a token-based design system defined in `src/styles/tokens.css`:

- **Colors**: Semantic color palette with dark mode support
- **Typography**: Inter (UI) + Merriweather (body/reading)
- **Spacing**: 4px base unit with consistent scale
- **Layout**: Max-width containers for optimal reading (65-75 chars)

### Key Design Principles

1. **Sacred Reading Mode**: Story content uses serif fonts with generous line-height (1.6-1.8)
2. **Minimalism with Purpose**: Clean interfaces that don't compete with emotional content
3. **Accessibility First**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support
4. **Reverent Design**: Respectful of grief while celebrating life

## Current Implementation Status

### ✅ Completed
- Project structure and build setup
- Design system foundation (tokens, components)
- Landing page with reading layout
- App shell with navigation
- Stub pages for core features:
  - Legacies
  - Stories
  - AI Chat (placeholder)
  - Search (placeholder)
- Auth guard integration (ready for Core API)
- Accessibility foundations

### 🚧 In Progress
- Story editor with TipTap
- AI chat with SSE streaming
- Search implementation

### 📋 Planned (Target Architecture)
- Module Federation for plugins
- Full BFF + OIDC integration
- Advanced AI personas
- Rich media gallery
- Relationship graph visualization

## Key Features

### Implemented

1. **Landing Page**
   - Emotional design following UX guidance
   - Clear value proposition
   - Sacred reading layout

2. **Navigation**
   - App shell with persistent nav
   - Active route highlighting
   - Keyboard accessible

3. **Design System**
   - Token-based theming
   - Dark mode support
   - Accessible components (Button, Input)
   - Consistent spacing and typography

4. **Auth Integration**
   - Protected route wrapper
   - Session validation via `/api/me`
   - Redirect to login on 401

### Placeholders (Ready for Implementation)

1. **Stories Management**
   - List view (stub)
   - Create/edit flow (needs TipTap editor)
   - Sacred reading view

2. **AI Chat**
   - Basic UI implemented
   - Needs SSE streaming integration
   - Persona selection (future)

3. **Search**
   - UI layout complete
   - Needs backend integration
   - Faceted filtering (future)

## API Integration

The frontend expects a Core API at `http://localhost:8080` with:

- `GET /api/me` - Current user info (session validation)
- Future endpoints as per API-DESIGN.md

Vite proxy configuration handles API routing during development.

## Accessibility

Following WCAG 2.1 AA standards:

- ✅ Keyboard navigation throughout
- ✅ Focus indicators (2px outline, sufficient contrast)
- ✅ Skip links for main content
- ✅ Semantic HTML and ARIA labels
- ✅ Color contrast meets 4.5:1 minimum
- ✅ Reduced motion support
- ✅ Screen reader friendly

## Next Steps

1. **Story Editor**: Implement TipTap with markdown support and autosave
2. **AI Streaming**: Add SSE hook and integrate with chat UI
3. **Backend Integration**: Connect to actual Core API endpoints
4. **Media Upload**: Presigned S3 upload flow
5. **Enhanced Features**: Timeline view, relationship graph

## Contributing

See the main project documentation in `/docs/` for:
- Architecture decisions
- UX guidance (mosaic-ux-guidance.md)
- API contracts
- Development guidelines

## License

[License TBD]
