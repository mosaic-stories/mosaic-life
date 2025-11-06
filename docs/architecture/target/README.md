# Target Architecture (Archived)

This folder contains the **target architecture** documentation that describes the long-term vision for Mosaic Life. These documents outline advanced features and complex patterns that we've intentionally **deferred** for the MVP.

## Status

**These documents are NOT active for MVP development.** They represent future capabilities that we may build once we have:
- Proven user demand
- Sufficient revenue or funding
- Larger team capacity
- Operational maturity

## Documents in this Archive

### CORE-BACKEND-ARCHITECTURE.md
Describes the full microservices architecture with:
- Service decomposition (BFF, Stories, Graph, Media, Search Indexer, Plugin Host)
- SNS/SQS event-driven patterns
- OpenSearch for search
- Neo4j for graph relationships
- LiteLLM proxy for AI
- Complex multi-tenancy

**When to revisit**: After we have >100k users or >5 developers

### FRONTEND-ARCHITECTURE.md
Describes advanced frontend features:
- Module Federation for runtime plugin loading
- Advanced AI chat interfaces
- Complex state management
- Plugin SDK and extensibility
- Multi-tenant UI

**When to revisit**: When third-party developers want to build plugins

### PLUGIN-ARCHITECTURE.md
Describes the complete plugin system:
- Backend microservice pattern
- Frontend Module Federation remotes
- Capability-based security
- Plugin registry and approval flow
- Helm-based deployment

**When to revisit**: When we have 3+ requests for custom extensions

## Current MVP Architecture

For the **active architecture** that we're building now, see:

👉 **[MVP-SIMPLIFIED-ARCHITECTURE.md](../MVP-SIMPLIFIED-ARCHITECTURE.md)**

This is the simplified stack:
- FastAPI + React + PostgreSQL + S3
- Google OAuth
- Single consolidated backend service
- No microservices, no graph DB, no search engine
- Cost: <$350/month
- Timeline: 9 weeks

## Migration Path

Each archived document includes a section on **when and how** to migrate from the simplified MVP to the complex target architecture. Key principles:

1. **Demand-driven**: Only add complexity when users explicitly request the feature
2. **Incremental**: Add one service at a time, not all at once
3. **Non-breaking**: Existing functionality continues working during migration
4. **Reversible**: Can roll back if complexity doesn't provide value

## When to Unarchive

Move a document back to `/docs/architecture/` when:
- We're actively implementing that architecture
- The team has reviewed and approved the migration plan
- We've validated the business case (ROI, user demand, cost)

## Questions?

If you're wondering "should we implement feature X from the target architecture?", ask:

1. **Do users explicitly request it?** (Not just "it would be nice")
2. **Does the simple approach fail?** (Postgres can't handle the query, for example)
3. **Is it cheaper than the workaround?** (OpenSearch vs. optimizing Postgres)
4. **Do we have capacity to operate it?** (Team bandwidth, runbook, monitoring)

If the answer to all four is "yes", then it's time to unarchive and implement.

---

**Archive Date**: January 2025
**Reason**: Simplification for MVP delivery
**Review**: After Phase 1 completion (Week 3)
