# Mosaic Life - Project Assessment & Risk Analysis

**Date**: January 2025
**Assessor**: AI Analysis based on architecture review and stakeholder interviews
**Context**: 2-person team, 3-month MVP goal, self-funded side project, $220/month current infrastructure cost

---

## Executive Summary

**Critical Finding**: Your project documentation describes a **sophisticated, enterprise-grade distributed system** while your actual MVP needs can be satisfied with a **simple 3-tier web application**. This architectural mismatch creates significant risks around cost, delivery time, and operational complexity.

**Impact**: The gap between documented architecture and actual MVP requirements represents **6-12 months of unnecessary engineering work** and could increase infrastructure costs to **$800-1200/month** if fully implemented.

**Recommendation**: Dramatic simplification to a **PostgreSQL + FastAPI + React + S3** stack will deliver your MVP in 3 months at **<$300/month** cost while preserving all core user value.

---

## 1. CRITICAL CHALLENGES

### 1.1 Architectural Over-Engineering (SEVERITY: CRITICAL)

**The Problem**: Your documentation specifies technology for problems you don't have yet.

| Technology | Documented Purpose | Actual MVP Need | Recommendation |
|------------|-------------------|-----------------|----------------|
| **OpenSearch** | Hybrid search, k-NN vectors, RAG-ready | Simple name search | **Remove**. Use Postgres `ILIKE` or `to_tsvector` |
| **Neo4j** | Complex relationship traversal | List stories chronologically | **Remove**. Use Postgres foreign keys |
| **SNS/SQS + Outbox Pattern** | Event-driven consistency | N/A (single service) | **Remove**. Direct database writes |
| **LiteLLM Proxy** | Multi-model routing, quotas | Simple OpenAI/Anthropic calls | **Remove**. Direct API calls |
| **Module Federation** | Runtime plugin loading | No plugins in MVP | **Remove**. Standard React components |
| **Microservices** | Independent scaling | Single consolidated service | **Remove**. Monolithic FastAPI app |
| **Localstack** | AWS service emulation | Dev environment only | **Keep** for local dev, but simplify |

**Cost Impact**:
- OpenSearch managed service: **~$150-300/month** (t3.small.search minimum)
- Neo4j on EC2: **~$80-150/month** (memory requirements)
- Additional EKS pods for services: **~$100-200/month** (compute)
- **Total unnecessary spend: $330-650/month**

**Time Impact**:
- Implementing the full documented stack: **12-16 weeks**
- Simplified stack: **4-6 weeks**

### 1.2 Cost Escalation Risk (SEVERITY: HIGH)

**Current**: $220/month for minimal deployment
**Projected with documented architecture**: $800-1200/month
**Projected with simplified architecture**: $250-350/month

**Cost Breakdown (Full Stack)**:
```
EKS cluster (control plane):              $73/month
Worker nodes (3x t3.medium):              $90/month
RDS PostgreSQL (db.t3.small):             $35/month
OpenSearch (t3.small.search):            $150/month
Application Load Balancer:                $25/month
NAT Gateway (2 AZs):                      $65/month
Data transfer:                            $30/month
S3 storage (estimate):                    $10/month
Route53 hosted zone:                       $1/month
Secrets Manager:                           $5/month
CloudWatch Logs:                          $15/month
ECR storage:                               $5/month
Backup storage:                           $20/month
Neo4j EC2 (r6g.large for memory):        $120/month
-------------------------------------------------------
TOTAL:                                   $644/month (before scaling)
```

**User Growth Impact**: At 1,000 active users with image uploads:
- S3 costs could jump to $50-100/month
- Data transfer: $100-200/month
- OpenSearch cluster sizing: +$200/month
- **New total: $1,000-1,200/month**

**Mitigation**:
- Remove OpenSearch → save $150/month immediately
- Remove Neo4j → save $120/month
- Combine services → reduce pod count → save $100/month
- **Simplified stack steady state: $250-350/month**

### 1.3 Technology Redundancy and Conflicts (SEVERITY: MEDIUM)

**Identified Conflicts**:

1. **Search Duplication**:
   - Postgres full-text search (built-in, free)
   - OpenSearch (separate service, $150/month, operational overhead)
   - **For MVP**: You only need name search on legacies. Postgres `WHERE name ILIKE '%query%'` is sufficient.

2. **Relationship Storage**:
   - Postgres foreign keys (already have this)
   - Neo4j graph database (planned, adds complexity)
   - **For MVP**: `legacy_members` junction table in Postgres handles all relationships.

3. **Event Processing**:
   - Direct database writes (simple, immediate consistency)
   - SNS/SQS + Outbox pattern (complex, eventual consistency)
   - **For MVP**: No distributed services = no need for event bus.

4. **AI Model Access**:
   - Direct OpenAI/Anthropic SDK calls (simple, 20 lines of code)
   - LiteLLM proxy (complex, another service to operate)
   - **For MVP**: Direct API calls with `openai` or `anthropic` Python SDK.

### 1.4 Undue Complexity (SEVERITY: HIGH)

**Documentation Complexity**: 2,800+ lines of architecture documentation describing patterns you won't use for 12+ months.

**Examples of Premature Optimization**:

1. **Transactional Outbox Pattern** (CORE-BACKEND-ARCHITECTURE.md §5.3)
   - Purpose: Ensure consistency across distributed services
   - MVP Reality: You have one database, one service
   - Impact: Adds 3 database tables, background worker, SNS/SQS infrastructure
   - **Defer until**: You actually split into multiple services

2. **Module Federation** (FRONTEND-ARCHITECTURE.md §4)
   - Purpose: Runtime plugin loading
   - MVP Reality: No plugins, no third-party extensions
   - Impact: Complex webpack config, CSP management, security surface
   - **Defer until**: You have actual plugin demand

3. **Multi-Tenant Architecture** (CORE-BACKEND-ARCHITECTURE.md §12)
   - Purpose: Isolated data per organization
   - MVP Reality: Single instance, user-based access control
   - Impact: Every query needs tenant filtering, RLS policies, tenant routing
   - **Defer until**: You have organizational customers

4. **Capability-Based Security** (PLUGIN-ARCHITECTURE.md §13)
   - Purpose: Fine-grained plugin permissions
   - MVP Reality: No plugins
   - Impact: Authorization layer complexity
   - **Defer until**: Plugin ecosystem exists

**Recommendation**: Archive 90% of current architecture docs. Create new "MVP-ARCHITECTURE.md" with simplified stack.

---

## 2. UNARTICULATED CHALLENGES

### 2.1 Operational Burden

**Hidden Complexity** you'll face with documented architecture:

| Service | Monitoring Needs | Backup/Recovery | Upgrade Path | Debugging Complexity |
|---------|-----------------|-----------------|--------------|---------------------|
| PostgreSQL | Queries, connections, replication lag | WAL archiving, PITR | Minor version patches | Medium |
| OpenSearch | Cluster health, shard allocation, JVM heap | Snapshot repository, restore testing | Major version migrations painful | **Very High** |
| Neo4j | Memory pressure, query performance, transaction logs | Backup + transaction logs | License changes, version compatibility | **High** |
| SNS/SQS | DLQ depth, message age, throughput | N/A (managed) | N/A | Medium |
| LiteLLM | Model availability, rate limits, cost tracking | Config backup | Model API changes | Medium |
| Multiple microservices | Service mesh observability, trace correlation | Per-service backup | Coordinated deployments | **Very High** |

**With Simplified Stack**:
| Service | Monitoring Needs | Backup/Recovery | Upgrade Path | Debugging Complexity |
|---------|-----------------|-----------------|--------------|---------------------|
| PostgreSQL | Queries, connections | Automated RDS snapshots | Click "upgrade" | Low |
| S3 | Cost, request rate | Versioning enabled | N/A | Very Low |
| Single FastAPI app | Request rate, errors, memory | Docker image tags in ECR | Rolling deployment | **Low** |

**Time Impact**: With complex stack, expect to spend **40-50% of development time on operations** (deployments, debugging, monitoring). With simplified stack: **10-15%**.

### 2.2 Testing and Development Velocity

**Current docker-compose.yml analysis**:
- 6 services to start for local development
- ~2GB memory required (OpenSearch alone uses 512MB-1GB)
- 30-60 second startup time
- Multiple health checks to satisfy

**Developer Experience Issues**:
1. **Slow feedback loops**: Change code → rebuild containers → wait for health checks → test
2. **Integration test complexity**: Need to seed Postgres, OpenSearch, SNS/SQS, manage event flows
3. **Local environment fragility**: "Works on my machine" with 6 moving parts
4. **Onboarding friction**: New contributor needs Docker, docker-compose, 4GB RAM, understanding of 6 services

**Simplified Stack**:
- 2 services: Postgres + your app
- ~300MB memory
- 5-10 second startup
- **Fast iteration**: Change Python code → auto-reload → test immediately

### 2.3 Data Model Simplification Opportunity

**Current documented models** (from DATA-DESIGN.md, if exists):
- Complex graph relationships in Neo4j
- Denormalized search indices in OpenSearch
- Event sourcing with outbox table
- Multi-tenant RLS policies

**Actual MVP needs** (based on your requirements):

```sql
-- COMPLETE MVP SCHEMA (25 lines)

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE legacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE,
  death_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE legacy_members (
  legacy_id UUID REFERENCES legacies(id),
  user_id UUID REFERENCES users(id),
  role TEXT DEFAULT 'member', -- 'creator', 'member', 'pending'
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (legacy_id, user_id)
);

CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id UUID REFERENCES legacies(id),
  author_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- markdown
  visibility TEXT DEFAULT 'private', -- 'public', 'private', 'personal'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  s3_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_stories_legacy ON stories(legacy_id, created_at DESC);
CREATE INDEX idx_legacy_members_user ON legacy_members(user_id);
CREATE INDEX idx_legacies_name ON legacies(name); -- For search
```

**That's it.** This schema supports:
- ✅ User registration (Google OAuth → `users`)
- ✅ Create legacies (`legacies`)
- ✅ Write stories (`stories`)
- ✅ List stories chronologically (index on `legacy_id, created_at`)
- ✅ Visibility control (`visibility` column)
- ✅ Search legacies by name (index on `name`)
- ✅ Join requests (`role='pending'` in `legacy_members`)
- ✅ Approve members (update `role` to `'member'`)
- ✅ Media uploads (`media` table + S3)

**No need for**: OpenSearch indices, Neo4j nodes/edges, event tables, outbox tables, tenant columns.

### 2.4 Security Considerations

**Documented Security Measures** (many unnecessary for MVP):

| Security Control | Documented | Actually Needed for MVP | Notes |
|------------------|------------|------------------------|-------|
| OIDC via Cognito | Yes | **No** | Google OAuth is simpler, cheaper ($0 vs Cognito MAU pricing) |
| BFF Pattern | Yes | **No** | FastAPI can issue httpOnly cookies directly |
| NetworkPolicy (K8s) | Yes | Yes | Keep this - basic cluster security |
| CSP for plugins | Yes | **No** | No plugins in MVP |
| Content sanitization | Yes | **Yes** | DOMPurify for markdown rendering |
| Secrets Manager | Yes | **Partial** | K8s secrets sufficient for MVP, Secrets Manager for production API keys |
| RLS (Row-Level Security) | Yes | **No** | Application-level authZ simpler for MVP |
| mTLS between services | Yes | **No** | No microservices |

**Critical Security Gaps** (things you need that aren't emphasized enough):

1. **Rate Limiting**: Not clearly specified
   - Need: Protect against abuse on legacy creation, story posting, AI chat
   - Solution: FastAPI middleware with Redis or in-memory cache

2. **Input Validation**: Mentioned but not detailed
   - Need: Pydantic models for all endpoints
   - Specific concerns: Markdown injection, XSS in story titles, filename validation for media

3. **Authorization Logic**: Documented as complex RBAC/ABAC
   - Need: Simple checks - "Can user X access legacy Y?"
   - Solution: Helper function `can_access_legacy(user_id, legacy_id, required_role)` checking `legacy_members` table

4. **API Key Rotation**: Not mentioned
   - Need: OpenAI/Anthropic keys in use
   - Solution: Document rotation procedure, use Secrets Manager in production

5. **Image Upload Validation**: Not specified
   - Need: Prevent malicious file uploads
   - Solution: Validate content-type, file size limits, virus scanning (ClamAV or S3 Macie later)

### 2.5 Federation Deferral Impact

**Good News**: You correctly identified federation as post-MVP.

**Hidden Complexity** you avoided by deferring:

1. **Instance Discovery**: DNS SRV records, WebFinger protocol, instance directory
2. **Cross-Instance Auth**: OAuth between instances, token exchange, trust establishment
3. **Data Portability**: Export/import formats, migration UX, orphaned reference handling
4. **Moderation**: Blocking instances, content reporting across boundaries
5. **Protocol Versioning**: ActivityPub or custom protocol, backward compatibility
6. **Storage Growth**: Cached copies of remote content

**Estimated Effort Saved**: 6-9 months of development time, 3-4 months of testing/iteration.

**When to revisit**: After you have 500+ active users and multiple organizations requesting private instances.

---

## 3. COST OPTIMIZATION OPPORTUNITIES

### 3.1 Infrastructure Right-Sizing

**Current Deployment** (from your description):
- EKS cluster with ArgoCD, backend, frontend
- $220/month

**Projected with Full Documented Stack**:
- +OpenSearch, +Neo4j, +LiteLLM, +multiple microservices
- $800-1200/month

**Recommended MVP Stack**:

```
┌─────────────────────────────────────────────┐
│ CloudFront (optional, later)                │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ Application Load Balancer                   │
│ - HTTPS termination (ACM cert)              │
│ - Route /api/* → Backend                    │
│ - Route /* → Frontend (S3 or EKS)           │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼────────────────────┐
│ EKS Cluster  │  │ RDS PostgreSQL            │
│              │  │ - db.t3.micro (dev)       │
│ Pods:        │  │ - db.t3.small (prod)      │
│ - core-api   │  │ - Automated backups       │
│ - web (opt)  │  │ - Encryption at rest      │
│ - argocd     │  └───────────────────────────┘
└───────┬──────┘
        │
┌───────▼──────────────────┐
│ S3 Buckets               │
│ - Media uploads          │
│ - Static web assets (opt)│
└──────────────────────────┘
```

**Cost Breakdown** (Simplified):
```
EKS cluster:                      $73/month
Worker nodes (2x t3.small):       $30/month
RDS PostgreSQL (db.t3.micro):     $15/month (dev), $25/month (prod)
ALB:                              $25/month
NAT Gateway (1 AZ):               $32/month
S3:                               $10/month (estimate)
Route53:                           $1/month
Data transfer:                    $20/month
CloudWatch:                       $10/month
ECR:                               $3/month
Secrets (K8s secrets, no SM):      $0/month
-------------------------------------------------------
TOTAL (dev):                     $219/month ← You're already here!
TOTAL (prod):                    $229/month
```

**Optimization Options**:

1. **Fargate instead of EKS** (if you want to reduce operational overhead):
   - Removes: Worker node management, cluster upgrades
   - Cost: Similar or slightly higher, but pay-per-pod
   - Trade-off: Less control, but simpler

2. **Render.com or Fly.io** (dramatic simplification):
   - Host: FastAPI backend, React frontend, Postgres
   - Cost: $20-50/month for MVP tier
   - Trade-off: Less control, vendor lock-in, but 10x faster to production
   - **Consider for rapid validation**, migrate to AWS later if it gains traction

3. **Stay on EKS** (your current path):
   - Advantage: Full control, already set up, scales to enterprise
   - Recommendation: Keep it, but simplify the application stack

### 3.2 Development Environment Cost Reduction

**Current**: Running dev resources in EKS costs same as production.

**Recommendation**:
- Use **local docker-compose** for development (Postgres + your app)
- Deploy to EKS only for preview environments (PR-based) and staging/prod
- Tear down preview environments after 7 days

**Savings**: Could run dev entirely locally, using AWS only for `argocd` + staging + prod = same $220/month even with traffic.

---

## 4. DELIVERY TIMELINE REALITY CHECK

### 4.1 Current Path (Documented Architecture)

**Estimated Timeline**:

| Phase | Tasks | Duration | Blocker Risk |
|-------|-------|----------|--------------|
| Infrastructure | OpenSearch cluster, Neo4j deployment, SNS/SQS setup, LiteLLM | 2 weeks | High (OpenSearch version compatibility, Neo4j memory tuning) |
| Backend Core | Auth, BFF pattern, adapter layers, outbox pattern | 3 weeks | Medium |
| Stories Service | CRUD, events, indexing, search adapter | 2 weeks | Medium |
| Graph Service | Neo4j integration, relationship APIs | 2 weeks | High (Cypher query complexity) |
| Search Indexer | Event consumer, OpenSearch indexing | 1 week | Medium |
| Frontend Core | Module Federation setup, auth flow, routing | 2 weeks | High (MF complexity) |
| Story Editor | TipTap, markdown, sanitization | 1 week | Low |
| Media Upload | Presigned URLs, S3, UI | 1 week | Low |
| AI Chat | LiteLLM integration, streaming, UI | 2 weeks | Medium (SSE complexity) |
| Testing & Polish | E2E tests, bug fixes, performance | 2 weeks | Medium |
| **TOTAL** | | **18 weeks** | **4.5 months** |

**Risk Factors**:
- OpenSearch learning curve (if new to you)
- Neo4j query optimization
- Module Federation CSP/CORS issues
- Event-driven debugging complexity
- Two-person team = no parallel work on backend/frontend if stuck

### 4.2 Simplified Path (Recommended)

**Revised Timeline**:

| Phase | Tasks | Duration | Blocker Risk |
|-------|-------|----------|--------------|
| Backend Schema | Create 5 tables in Postgres, migrations | 2 days | Low |
| Google OAuth | OAuth flow, session cookies, `/me` endpoint | 3 days | Low (well-documented) |
| Legacy CRUD | Create, list, search by name, join requests | 4 days | Low |
| Story CRUD | Create, list, visibility filtering | 3 days | Low |
| Media Upload | Presigned S3 URLs, upload UI, reference in markdown | 3 days | Low |
| Frontend Shell | React Router, auth guard, basic layout | 2 days | Low |
| Legacy UI | Create form, list view, search input, join request flow | 4 days | Low |
| Story Editor | TipTap wrapper, markdown rendering, save | 4 days | Low |
| Story List | Display stories, filter by visibility | 2 days | Low |
| AI Chat (optional) | Direct OpenAI call, simple streaming, UI | 4 days | Medium (can defer) |
| Testing & Polish | Playwright E2E, bug fixes, deployment | 5 days | Low |
| **TOTAL** | | **36 days** | **~7-8 weeks with buffer** |

**Confidence Level**: High. This is a well-understood stack with mature tooling.

### 4.3 Recommendation

**Ship in 3 phases**:

**Phase 1 (Weeks 1-3): Core MVP** - No AI
- Google OAuth
- Legacy CRUD + search
- Story CRUD + visibility
- Media upload
- Deploy to production

**Phase 2 (Weeks 4-6): Polish + Media**
- Story editor improvements
- Image embedding in stories
- Permissions refinement
- Invite flow

**Phase 3 (Weeks 7-9): AI (if desired)**
- Simple chat interface
- 2-3 agent personas
- Direct API calls (OpenAI or Anthropic)

**Result**: Usable MVP in production by Week 3, full-featured by Week 9.

---

## 5. TECHNICAL DEBT AND EVOLUTION PATH

### 5.1 Acceptable Technical Debt for MVP

**It's OK to**:
- Use SQLite for local dev (instead of Postgres)
- Store sessions in-memory (add Redis later)
- No caching layer (add later when needed)
- Basic error handling (improve observability later)
- Manual database backups (automate later)
- No CI/CD for database migrations (add later)

**Not OK to defer**:
- Input validation (Pydantic models)
- SQL injection prevention (use parameterized queries)
- XSS prevention (sanitize markdown)
- Authentication (Google OAuth from day 1)
- HTTPS (use ACM cert from day 1)

### 5.2 Evolution Path to Target Architecture

**When to add each piece** (in order of value):

1. **Postgres full-text search** (when name search isn't enough)
   - Trigger: Users want to search story content
   - Effort: 2-3 days (add `to_tsvector` column, indexes)
   - Cost: $0 (already have Postgres)

2. **Redis for sessions/caching** (when scale requires)
   - Trigger: >1000 concurrent users, or need multi-pod sessions
   - Effort: 1 week (add ElastiCache, refactor session storage)
   - Cost: +$15/month (cache.t3.micro)

3. **OpenSearch** (when you need semantic search or complex aggregations)
   - Trigger: Users request "find stories similar to this" or faceted search
   - Effort: 2-3 weeks (indexing pipeline, query translation)
   - Cost: +$150/month

4. **AI with RAG** (when you want context-aware AI)
   - Trigger: AI needs to reference user's specific stories
   - Effort: 3-4 weeks (embeddings, vector storage, retrieval logic)
   - Cost: +$50/month (OpenAI embeddings + storage)

5. **Microservices split** (when team grows or services have different scaling needs)
   - Trigger: >3 developers, or media processing needs different resources than API
   - Effort: 4-6 weeks (extract services, add API gateway, event bus)
   - Cost: +$100-200/month (more pods, potential message queue)

6. **Neo4j** (when you need complex relationship traversals)
   - Trigger: Features like "find all stories that mention person X" or "path between two people"
   - Effort: 6-8 weeks (schema design, projection from Postgres, query optimization)
   - Cost: +$120/month

7. **Federation** (when you have organizational customers wanting private instances)
   - Trigger: 3+ organizations request self-hosting
   - Effort: 6-9 months (protocol design, multi-instance testing, migration tools)
   - Cost: Per-instance (same as your hosted version)

**Key Insight**: Each of these can be added **incrementally** without rewriting the core app, IF you:
- Use adapter patterns (even in simplified stack)
- Keep business logic separate from persistence
- Write integration tests

---

## 6. RECOMMENDATIONS

### 6.1 Immediate Actions (This Week)

**1. Create Simplified Architecture Document**
- File: `/docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md`
- Content: Postgres + FastAPI + React + S3 stack
- Archive current complex docs to `/docs/architecture/target/` (for future reference)

**2. Simplify docker-compose.yml**
- Remove: OpenSearch, Localstack, Jaeger (initially), Neo4j
- Keep: Postgres, core-api, web
- Add: Simple `docker-compose.dev.yml` for fast iteration

**3. Create MVP Schema**
- File: `/services/core-api/alembic/versions/001_mvp_schema.py`
- Content: 5 tables (users, legacies, legacy_members, stories, media)
- Run migration, verify locally

**4. Audit and Remove Unused Dependencies**
- Backend: Remove `opensearch-py`, `neo4j`, `aioboto3` (for now)
- Frontend: Remove Module Federation config, plugin SDK references
- Result: Faster builds, smaller images

**5. Update MVP-EXECUTION-PLAN.md**
- Reflect simplified 3-phase timeline (9 weeks)
- Remove references to OpenSearch, Neo4j, event bus
- Focus on Google OAuth → CRUD → Media → AI (optional)

### 6.2 Near-Term (Next 2 Weeks)

**1. Implement Google OAuth**
- Use `authlib` or `fastapi-sso` library
- Store sessions in Postgres (simple `sessions` table)
- Issue httpOnly cookies (SameSite=Lax)

**2. Build Legacy + Story CRUD APIs**
- FastAPI routers: `/api/legacies`, `/api/stories`
- Pydantic models for validation
- Basic authorization (check `legacy_members` table)

**3. Build React UI Shell**
- React Router with auth guard
- Legacy list, legacy detail, story list, story create
- Simple, functional design (polish later)

**4. Deploy to Staging**
- Use existing ArgoCD setup
- RDS Postgres (db.t3.micro for now)
- S3 bucket for media
- Test end-to-end flow

### 6.3 Medium-Term (Weeks 3-6)

**1. Story Editor**
- TipTap integration
- Markdown preview
- Image upload + embed in markdown

**2. Search by Name**
- Simple `ILIKE` query on `legacies.name`
- Pagination (LIMIT/OFFSET or cursor-based)

**3. Join Request Flow**
- "Request to join legacy" button
- Email notification (SendGrid or SES)
- Approval UI for creators

**4. Testing**
- Playwright E2E: Auth, create legacy, write story, upload image
- Unit tests: Authorization helpers, Pydantic models

### 6.4 Long-Term (Months 3-6+)

**1. AI Chat** (if prioritized)
- Direct OpenAI/Anthropic API integration
- Simple streaming with SSE
- 2-3 agent personas

**2. Advanced Search** (if needed)
- Postgres full-text search on story content
- Filters: date range, author, visibility

**3. Observability**
- OpenTelemetry (already in config, activate it)
- Structured logging
- Error tracking (Sentry or self-hosted)

**4. Scale Optimizations** (only when needed)
- Redis for session storage
- CloudFront for static assets
- Read replicas (if query load high)

---

## 7. RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Cost overrun** (hitting $500/month before users) | Medium | High | Implement simplified stack; remove OpenSearch/Neo4j |
| **Delivery delay** (>6 months to MVP) | High (current path) | High | Adopt 3-phase simplified timeline |
| **Operational burnout** (too much time on DevOps) | Medium | High | Reduce service count; use managed services (RDS) |
| **AI costs spike** (OpenAI bills exceed budget) | Medium | Medium | Add rate limiting; monitor usage; set budget alerts |
| **Data loss** (no backup strategy) | Low | Critical | Enable RDS automated backups; test restore process |
| **Security breach** (SQL injection, XSS) | Medium | Critical | Pydantic validation; parameterized queries; DOMPurify |
| **Lock-in to complex stack** | High (current docs) | Medium | Simplify now; defer complex tech until proven need |
| **User growth exceeds capacity** | Low (early days) | Medium | Start with t3.micro, scale up when needed; monitor costs |
| **Google OAuth breaks** (API changes) | Low | Medium | Have fallback auth (email/password) planned |
| **S3 costs explode** (image uploads) | Medium | Medium | Set per-user storage limits; lifecycle policies |

---

## 8. SUCCESS METRICS

### 8.1 MVP Success (3 Months)

**Technical Metrics**:
- [ ] MVP deployed to production (public URL)
- [ ] <$300/month infrastructure cost
- [ ] <200ms p95 API response time
- [ ] >95% uptime
- [ ] Zero critical security vulnerabilities

**User Metrics**:
- [ ] 10+ users (friends/family) actively using
- [ ] 50+ stories written
- [ ] 10+ legacies created
- [ ] >80% user satisfaction (informal survey)

**Team Metrics**:
- [ ] <10 hours/week on operations (monitoring, deployments)
- [ ] Ability to ship features weekly
- [ ] No major outages (>1 hour downtime)

### 8.2 6-Month Success (Growth Phase)

**Technical Metrics**:
- [ ] 99% uptime
- [ ] <$500/month infrastructure cost (even with 100+ users)
- [ ] Full test coverage (>80%)
- [ ] Monitoring/alerting in place

**User Metrics**:
- [ ] 100+ registered users
- [ ] 500+ stories
- [ ] 50+ legacies
- [ ] Active engagement (users returning weekly)
- [ ] First paying customer (if monetized)

**Business Metrics**:
- [ ] Decision point: Continue investment or pivot
- [ ] Investor conversations (if seeking funding)
- [ ] Open source traction (GitHub stars, contributors)

---

## 9. CONCLUSION

### Summary of Findings

**Strengths**:
- ✅ Mature infrastructure already deployed (EKS, CI/CD, ArgoCD)
- ✅ Experienced team with deep technical expertise
- ✅ Clear MVP requirements (after clarification)
- ✅ Realistic timeline expectations (3 months)
- ✅ Strong personal motivation and domain understanding

**Critical Weaknesses**:
- ❌ **Architectural over-engineering**: 10x more complexity than needed
- ❌ **Cost trajectory**: Projected spend 3-5x higher than necessary
- ❌ **Delivery risk**: Current documented path = 18 weeks vs. 7-8 weeks simplified
- ❌ **Operational burden**: 6 services vs. 2 services = 3x operational overhead

**Recommended Path Forward**:

1. **Simplify ruthlessly**: Postgres + FastAPI + React + S3
2. **Ship iteratively**: 3-week MVP, 6-week polished, 9-week AI-enhanced
3. **Defer complexity**: Add OpenSearch/Neo4j/microservices only when proven need emerges
4. **Stay under $300/month** until you have paying customers

**Expected Outcome**:
- MVP in production: **Week 3**
- Full-featured MVP: **Week 9**
- Cost: **<$300/month**
- Operational overhead: **<5 hours/week**
- Path to scale: **Clear, incremental**

### Final Recommendation

**Archive the current complex architecture documentation.** Treat it as a "North Star" for where the platform *could* go in 2-3 years, but build the simple, boring, proven stack first.

You don't need OpenSearch, Neo4j, microservices, or Module Federation to preserve your mother's stories. You need a reliable database, a clean API, and a respectful UI. Everything else is optional.

**Ship the Honda. Upgrade to the Ferrari when you have the revenue to justify it.**

---

## Appendix: Simplified MVP Stack Overview

### Technology Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React + Vite + React Router | Fast dev experience, simple deployment |
| **Backend** | FastAPI + Pydantic | Fast to build, great docs, type-safe |
| **Database** | PostgreSQL (RDS) | Reliable, full-text search built-in, handles relationships well |
| **Auth** | Google OAuth (direct) | Simpler than Cognito, $0 cost, trusted by users |
| **Storage** | S3 | Industry standard, cheap, reliable |
| **Deployment** | EKS (already have it) | Keep current setup, simplify what runs on it |
| **Monitoring** | CloudWatch + basic metrics | Start simple, upgrade to Grafana later if needed |
| **AI** | Direct OpenAI/Anthropic SDK | No proxy needed, simple to implement |

### What You're NOT Using (Yet)

- ❌ OpenSearch
- ❌ Neo4j
- ❌ SNS/SQS/Localstack
- ❌ LiteLLM
- ❌ Module Federation
- ❌ Microservices
- ❌ BFF pattern
- ❌ Event sourcing
- ❌ Row-Level Security

### When to Revisit

Add complexity only when:
1. **Users explicitly request** the feature enabled by that technology
2. **Metrics show** the simpler approach is failing (e.g., search too slow)
3. **Cost analysis proves** the complex option is cheaper at scale
4. **Team capacity exists** to operate the additional complexity

Until then: **Keep it simple. Ship it. Learn from real users.**
