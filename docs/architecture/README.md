# Architecture Documentation

This folder contains the architecture documentation for Mosaic Life.

## Active Architecture (MVP)

👉 **[MVP-SIMPLIFIED-ARCHITECTURE.md](./MVP-SIMPLIFIED-ARCHITECTURE.md)** - **READ THIS FIRST**

This is the **current active architecture** we're building for the MVP:
- PostgreSQL + FastAPI + React + S3
- Google OAuth authentication
- Single consolidated backend service
- Separate frontend service
- Target: 9-week delivery, <$350/month cost

**Status**: Active development
**Timeline**: Weeks 1-9
**Cost**: <$350/month

## Supporting Documents

### [API-DESIGN.md](./API-DESIGN.md)
API design patterns, endpoint specifications, and OpenAPI contracts.

### [DATA-DESIGN.md](./DATA-DESIGN.md)
Database schema design, relationships, and data modeling decisions.

### [mosaic-ux-guidance.md](./mosaic-ux-guidance.md)
UX design principles, visual language, and interaction patterns for the memorial stories platform.

## Archived / Future Architecture

The `/target/` folder contains documentation for **advanced features we've deferred**:
- [CORE-BACKEND-ARCHITECTURE.md](./target/CORE-BACKEND-ARCHITECTURE.md) - Microservices, OpenSearch, Neo4j
- [FRONTEND-ARCHITECTURE.md](./target/FRONTEND-ARCHITECTURE.md) - Module Federation, plugins
- [PLUGIN-ARCHITECTURE.md](./target/PLUGIN-ARCHITECTURE.md) - Plugin system design

**These are NOT active for MVP.** See [target/README.md](./target/README.md) for when to revisit.

## Decision Records

Architecture decisions are documented in `/docs/adr/`:
- [ADR-0001: MVP Option B](../adr/0001-mvp-option-b.md) - Original decision (now superseded by simplified approach)

## Quick Start

**For Developers**:
1. Read [MVP-SIMPLIFIED-ARCHITECTURE.md](./MVP-SIMPLIFIED-ARCHITECTURE.md)
2. Review [MVP-SIMPLIFIED-EXECUTION-PLAN.md](../project/MVP-SIMPLIFIED-EXECUTION-PLAN.md)
3. Check [PROJECT-ASSESSMENT.md](../project/PROJECT-ASSESSMENT.md) for context on simplification

**For Stakeholders**:
1. Read [PROJECT-ASSESSMENT.md](../project/PROJECT-ASSESSMENT.md) - Why we simplified
2. See [MVP-EXECUTION-PLAN.md](../project/MVP-SIMPLIFIED-EXECUTION-PLAN.md) - What we're building
3. Review cost estimates in MVP-SIMPLIFIED-ARCHITECTURE.md

## Questions?

- **"Should we implement feature X?"** → Check if it's in the simplified architecture. If not, it's deferred.
- **"When will we add OpenSearch/Neo4j/etc?"** → See Migration Path in MVP-SIMPLIFIED-ARCHITECTURE.md
- **"Why did we simplify?"** → Read PROJECT-ASSESSMENT.md

---

**Last Updated**: January 2025
**Next Review**: After Phase 1 completion (Week 3)
