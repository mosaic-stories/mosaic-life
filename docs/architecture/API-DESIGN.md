# Mosaic Life - API Design Architecture

## Overview

This document defines the comprehensive API architecture for Mosaic Life, including external client APIs, internal service APIs, plugin APIs, and integration patterns. This serves as the authoritative source for all API-related design decisions across the platform.

> **⚠️ Architecture Evolution:** This document describes both the **target API architecture** and the **current MVP implementation**. For MVP development, we are implementing a consolidated "Core API" service. The plugin contracts and multi-service APIs are designed to enable future service separation.

## API Architecture Principles

### Design Philosophy
- **API-First Design**: OpenAPI/JSON Schema drives development with code generation
- **Consistent Patterns**: Uniform error handling, pagination, and response formats
- **Secure by Default**: Authentication, authorization, and input validation on all endpoints
- **Tenant-Aware**: All APIs scoped to appropriate tenant/legacy context
- **Version Stability**: Semantic versioning with backward compatibility guarantees

### Transport & Protocols
- **External APIs**: REST over HTTPS with JSON payloads
- **Internal APIs**: REST/HTTP for service-to-service (gRPC optional for high-volume)
- **Real-time**: Server-Sent Events (SSE) for streaming, WebSockets for bidirectional
- **Plugin APIs**: HTTP+JSON with standardized contracts

## External API Architecture (BFF Pattern)

### Backend-for-Frontend (BFF) Layer
The BFF serves as the primary external API gateway, handling:
- **Authentication**: OIDC flow completion and session management
- **Authorization**: Request-level permissions and tenant scoping
- **Request Orchestration**: Fan-out to internal services and response aggregation
- **Rate Limiting**: Per-user and per-tenant quota enforcement
- **Response Shaping**: Client-optimized response formats

### Authentication Flow
```typescript
// OIDC Authorization Code + PKCE Flow
interface AuthenticationFlow {
  // 1. Frontend initiates OIDC flow
  initiateAuth(): { 
    authUrl: string; 
    state: string; 
    codeVerifier: string; 
  };
  
  // 2. BFF completes code exchange
  completeAuth(code: string, state: string): Promise<{
    user: UserProfile;
    sessionCookie: string; // httpOnly, SameSite=Lax
  }>;
  
  // 3. Session validation
  validateSession(): Promise<UserContext>;
  
  // 4. Session refresh
  refreshSession(): Promise<void>;
}
```

### Session Management
```yaml
# Cookie Configuration
session_cookie:
  name: "mosaic_session"
  httpOnly: true
  secure: true # HTTPS only
  sameSite: "Lax"
  path: "/"
  maxAge: 3600 # 1 hour
  
refresh_cookie:
  name: "mosaic_refresh"
  httpOnly: true
  secure: true
  sameSite: "Strict"
  path: "/auth"
  maxAge: 604800 # 7 days
```

## Core API Endpoints

### Base URL Structure
```
https://api.mosaiclife.app/api/v1
```

### Authentication & User Management
```yaml
# Authentication
POST /auth/login                    # Initiate OIDC flow
POST /auth/callback                 # Complete OIDC flow  
POST /auth/logout                   # End session
GET  /auth/me                       # Current user info
POST /auth/refresh                  # Refresh session

# User Management
GET  /users/profile                 # User profile
PUT  /users/profile                 # Update profile
GET  /users/{user_id}               # Get user by ID (if permitted)
PUT  /users/{user_id}/permissions   # Update user permissions (admin)
```

### Legacy Management
```yaml
# Legacy CRUD
GET  /legacies                      # List accessible legacies
POST /legacies                      # Create legacy
GET  /legacies/{legacy_id}          # Get legacy details
PUT  /legacies/{legacy_id}          # Update legacy
DELETE /legacies/{legacy_id}        # Delete legacy (admin only)

# Legacy Settings
GET  /legacies/{legacy_id}/settings # Get legacy settings
PUT  /legacies/{legacy_id}/settings # Update legacy settings
```

### Story Management
```yaml
# Story CRUD
GET  /legacies/{legacy_id}/stories                    # List stories
POST /legacies/{legacy_id}/stories                    # Create story
GET  /legacies/{legacy_id}/stories/{story_id}         # Get story
PUT  /legacies/{legacy_id}/stories/{story_id}         # Update story
DELETE /legacies/{legacy_id}/stories/{story_id}       # Delete story

# Story Operations
POST /legacies/{legacy_id}/stories/{story_id}/approve # Approve story (moderator)
POST /legacies/{legacy_id}/stories/{story_id}/reject  # Reject story (moderator)
GET  /legacies/{legacy_id}/stories/{story_id}/history # Story revision history
POST /legacies/{legacy_id}/stories/{story_id}/restore/{revision_id} # Restore revision

# Bulk Operations
POST /legacies/{legacy_id}/stories/bulk-update       # Bulk story operations
POST /legacies/{legacy_id}/stories/export            # Export stories
```

### Group Management
```yaml
# Group Operations
GET  /legacies/{legacy_id}/groups                    # List groups
POST /legacies/{legacy_id}/groups                    # Create group
GET  /legacies/{legacy_id}/groups/{group_id}         # Get group
PUT  /legacies/{legacy_id}/groups/{group_id}         # Update group
DELETE /legacies/{legacy_id}/groups/{group_id}       # Delete group

# Group Membership
POST /legacies/{legacy_id}/groups/{group_id}/members # Add members
DELETE /legacies/{legacy_id}/groups/{group_id}/members/{user_id} # Remove member
```

### AI & Chat
```yaml
# AI Conversations
GET  /legacies/{legacy_id}/conversations             # List conversations
POST /legacies/{legacy_id}/conversations             # Start conversation
GET  /legacies/{legacy_id}/conversations/{conv_id}   # Get conversation
DELETE /legacies/{legacy_id}/conversations/{conv_id} # Delete conversation

# Chat Streaming (SSE)
POST /legacies/{legacy_id}/chat/stream               # Stream chat response
GET  /legacies/{legacy_id}/chat/models               # Available AI models

# AI Configuration
GET  /legacies/{legacy_id}/ai/persona                # Get AI persona
PUT  /legacies/{legacy_id}/ai/persona                # Update AI persona
POST /legacies/{legacy_id}/ai/persona/regenerate     # Regenerate persona
```

### Search & Discovery
```yaml
# Search
GET  /search                                         # Global search (user-scoped)
GET  /legacies/{legacy_id}/search                    # Legacy-specific search
POST /search/semantic                                # Semantic/vector search
GET  /search/suggestions                             # Search suggestions/autocomplete

# Discovery
GET  /legacies/{legacy_id}/timeline                  # Story timeline
GET  /legacies/{legacy_id}/relationships             # Relationship graph
GET  /legacies/{legacy_id}/insights                  # AI-generated insights
```

### Media Management
```yaml
# Media Upload
POST /media/upload/presigned                         # Get presigned upload URL
POST /media/upload/complete                          # Complete upload
GET  /media/{media_id}                              # Get media metadata
DELETE /media/{media_id}                            # Delete media

# Media Processing
GET  /media/{media_id}/status                       # Processing status
GET  /media/{media_id}/thumbnails                   # Get thumbnails
GET  /media/{media_id}/transcription                # Get transcription (if audio/video)
```

### Administration
```yaml
# Admin - Story Moderation
GET  /admin/stories/pending                         # Pending approval
POST /admin/stories/{story_id}/approve              # Approve story
POST /admin/stories/{story_id}/reject               # Reject story

# Admin - User Management
GET  /admin/users                                   # List users
POST /admin/users/{user_id}/suspend                 # Suspend user
POST /admin/users/{user_id}/unsuspend               # Unsuspend user

# Admin - System
GET  /admin/system/health                           # System health
GET  /admin/system/metrics                          # System metrics
POST /admin/system/maintenance                      # Maintenance mode
```

## Plugin API Architecture

### Plugin Registration & Management
```yaml
# Plugin Lifecycle
POST /api/v1/plugins/register                       # Plugin self-registration
GET  /api/v1/plugins                               # List installed plugins
GET  /api/v1/plugins/{plugin_id}                   # Get plugin details
PUT  /api/v1/plugins/{plugin_id}/enable            # Enable plugin
PUT  /api/v1/plugins/{plugin_id}/disable           # Disable plugin
DELETE /api/v1/plugins/{plugin_id}                 # Uninstall plugin

# Plugin Manifest & Health
GET  /api/v1/plugins/{plugin_id}/manifest          # Get plugin manifest
GET  /api/v1/plugins/{plugin_id}/healthz           # Plugin health check
GET  /api/v1/plugins/{plugin_id}/readyz            # Plugin readiness check
GET  /api/v1/plugins/{plugin_id}/metrics           # Plugin metrics
```

### Plugin Data Access API
```yaml
# Scoped Data Access (for plugins)
GET  /api/v1/plugins/data/stories                  # Get accessible stories
GET  /api/v1/plugins/data/legacies                 # Get accessible legacies  
GET  /api/v1/plugins/data/users                    # Get accessible users
POST /api/v1/plugins/data/metadata                 # Add story metadata
GET  /api/v1/plugins/data/relationships            # Get relationship data

# Plugin Events
POST /api/v1/plugins/events/publish                # Publish plugin event
GET  /api/v1/plugins/events/subscribe/{topic}      # Subscribe to events (SSE)
POST /api/v1/events/webhook/{plugin_id}            # Webhook endpoint for plugins
```

### Plugin Service Standards
Every plugin backend service must implement these endpoints:
```yaml
# Required Plugin Endpoints
GET  /healthz                                       # Liveness probe
GET  /readyz                                        # Readiness probe  
GET  /metrics                                       # Prometheus metrics
GET  /manifest                                      # Plugin manifest as JSON
POST /register                                      # Self-registration with core

# Plugin-Specific APIs (examples)
POST /v1/jobs/run                                   # Trigger background job
GET  /v1/data/items                                # List plugin data items
POST /v1/webhooks/ingest                           # Inbound webhook handler
```

## API Request/Response Patterns

### Standard Request Headers
```yaml
# Authentication
Authorization: Bearer {jwt_token}        # For plugin-to-core calls
Cookie: mosaic_session={session_id}      # For user sessions

# Tracing & Observability  
X-Request-ID: {ulid}                     # Request tracking
Traceparent: {trace_context}             # OpenTelemetry context
User-Agent: {client_info}                # Client identification

# API Versioning
Accept: application/json                 # Content negotiation
API-Version: v1                          # Explicit version (optional)
```

### Standard Response Format
```typescript
// Success Response
interface SuccessResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
      nextCursor?: string;
    };
    requestId: string;
    timestamp: string;
  };
}

// Error Response
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: any[];        // Additional error context
    requestId: string;      // Request tracking ID
    timestamp: string;      // ISO 8601 timestamp
  };
}
```

### Pagination Patterns
```typescript
// Cursor-Based Pagination (preferred)
interface CursorPagination {
  limit?: number;          // Max items per page (default: 20, max: 100)
  cursor?: string;         // Opaque cursor for next page
  order?: 'asc' | 'desc'; // Sort order
}

// Offset-Based Pagination (legacy endpoints only)
interface OffsetPagination {
  page?: number;           // Page number (1-indexed)
  limit?: number;          // Items per page
}
```

### Error Handling Standards
```typescript
// HTTP Status Codes
interface StatusCodes {
  200: "OK";                    // Success
  201: "Created";               // Resource created
  204: "No Content";            // Success, no response body
  400: "Bad Request";           // Invalid request
  401: "Unauthorized";          // Authentication required
  403: "Forbidden";             // Insufficient permissions
  404: "Not Found";             // Resource not found
  409: "Conflict";              // Resource conflict
  422: "Unprocessable Entity";  // Validation errors
  429: "Too Many Requests";     // Rate limit exceeded
  500: "Internal Server Error"; // Server error
  503: "Service Unavailable";   // Temporary unavailability
}

// Error Code Patterns
interface ErrorCodes {
  // Authentication & Authorization
  AUTH_REQUIRED: "Authentication required";
  AUTH_INVALID: "Invalid credentials";
  AUTH_EXPIRED: "Session expired";
  PERMISSION_DENIED: "Insufficient permissions";
  
  // Validation
  VALIDATION_FAILED: "Input validation failed";
  MISSING_REQUIRED_FIELD: "Required field missing";
  INVALID_FORMAT: "Invalid field format";
  
  // Resources
  RESOURCE_NOT_FOUND: "Resource not found";
  RESOURCE_CONFLICT: "Resource conflict";
  RESOURCE_LIMIT_EXCEEDED: "Resource limit exceeded";
  
  // Business Logic
  STORY_NOT_APPROVED: "Story requires approval";
  LEGACY_ACCESS_DENIED: "Legacy access denied";
  PLUGIN_DISABLED: "Plugin is disabled";
}
```

## Real-Time APIs

### Server-Sent Events (SSE)
```typescript
// SSE Connection Management
interface SSEConnection {
  url: string;              // SSE endpoint
  headers: Record<string, string>;
  reconnect: boolean;       // Auto-reconnect on disconnect
  retryInterval: number;    // Retry delay (exponential backoff)
}

// AI Chat Streaming
POST /legacies/{legacy_id}/chat/stream
Content-Type: application/json
Accept: text/event-stream

{
  "message": "Tell me about dad's childhood",
  "conversationId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "model": "claude-3-sonnet"
}

// SSE Response Format
data: {"type": "token", "content": "I", "delta": true}
data: {"type": "token", "content": " remember", "delta": true}
data: {"type": "citation", "storyId": "01ARZ3NDEKTSV4RRFFQ69G5FAV"}
data: {"type": "done", "messageId": "01ARZ3NDEKTSV4RRFFQ69G5FAV"}
```

### Event Subscription Patterns
```typescript
// Plugin Event Subscription
GET /api/v1/plugins/events/subscribe/stories.created
Accept: text/event-stream
Authorization: Bearer {plugin_token}

// Event Message Format
interface EventMessage {
  id: string;              // Event ID (ULID)
  type: string;            // Event type
  source: string;          // Event source
  timestamp: string;       // ISO 8601 timestamp
  tenantId: string;        // Tenant scope
  payload: any;            // Event-specific data
}
```

## Internal Service APIs

### Service-to-Service Communication
```typescript
// Internal API Client Pattern
interface InternalAPIClient {
  baseURL: string;
  timeout: number;         // Request timeout
  retries: number;         // Retry attempts
  headers: {
    'Authorization': string;        // Service JWT
    'X-Service-Name': string;      // Calling service
    'Traceparent': string;         // Trace context
  };
}

// Service Discovery
interface ServiceEndpoints {
  stories: "http://stories-service:8080";
  graph: "http://graph-service:8080";
  media: "http://media-service:8080";
  search: "http://search-service:8080";
  ai_registry: "http://ai-registry:8080";
}
```

### Inter-Service API Patterns
```yaml
# Stories Service Internal API
GET  /internal/v1/stories/{story_id}                # Get story by ID
POST /internal/v1/stories/{story_id}/events         # Emit story event
GET  /internal/v1/legacies/{legacy_id}/stories      # Get legacy stories

# Graph Service Internal API  
POST /internal/v1/relationships                     # Create relationship
GET  /internal/v1/traverse                          # Graph traversal
POST /internal/v1/bulk-index                        # Bulk relationship updates

# Media Service Internal API
POST /internal/v1/media/process                     # Trigger processing
GET  /internal/v1/media/{media_id}/status           # Processing status
POST /internal/v1/media/{media_id}/webhooks         # Processing webhooks
```

## AI Registry API (LiteLLM)

### Model Access Patterns
```typescript
// AI Model Registry
interface AIModelRegistry {
  // Model Selection
  listModels(tenantId: string): Promise<AIModel[]>;
  getModel(modelId: string): Promise<AIModel>;
  
  // Usage & Quotas
  getUsage(tenantId: string, timeframe: string): Promise<UsageStats>;
  getQuotas(tenantId: string): Promise<QuotaLimits>;
  
  // Generation
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  generateStream(request: GenerationRequest): AsyncIterator<GenerationChunk>;
  
  // Embeddings & Moderation
  embed(text: string[], model?: string): Promise<EmbeddingResponse>;
  moderate(content: string): Promise<ModerationResponse>;
}

// AI API Endpoints (Internal)
POST /ai/v1/generate                                # Text generation
POST /ai/v1/generate/stream                         # Streaming generation
POST /ai/v1/embed                                   # Text embeddings
POST /ai/v1/moderate                                # Content moderation
GET  /ai/v1/models                                  # Available models
GET  /ai/v1/usage/{tenant_id}                       # Usage statistics
```

## API Security Architecture

### Authentication Methods
```typescript
// Authentication Types by API Layer
interface AuthenticationMethods {
  // External API (BFF)
  userSession: {
    method: "httpOnly_cookies";
    cookie: "mosaic_session";
    validation: "/auth/me";
  };
  
  // Plugin API
  pluginBearer: {
    method: "bearer_token";
    header: "Authorization: Bearer {token}";
    scope: "plugin:{plugin_id}";
  };
  
  // Internal API
  serviceJWT: {
    method: "jwt_bearer";
    issuer: "mosaic-core";
    audience: "internal-services";
  };
}
```

### Authorization Patterns
```typescript
// Permission Checking
interface AuthorizationService {
  // Context-based authorization
  checkPermission(
    subject: UserContext | PluginContext,
    action: string,
    resource: ResourceIdentifier,
    context?: AuthorizationContext
  ): Promise<boolean>;
  
  // Bulk permission checking
  filterAuthorized<T extends Resource>(
    subject: UserContext,
    action: string,
    resources: T[]
  ): Promise<T[]>;
}

// Resource-based permissions
interface ResourcePermissions {
  // Legacy permissions
  "legacy:read": ["owner", "editor", "viewer"];
  "legacy:write": ["owner", "editor"];  
  "legacy:admin": ["owner"];
  
  // Story permissions
  "story:read": ["owner", "editor", "viewer", "group_member"];
  "story:write": ["owner", "editor"];
  "story:approve": ["owner", "moderator"];
  
  // Plugin permissions  
  "plugin:execute": ["capability_granted"];
  "plugin:data_read": ["data_scope_granted"];
}
```

### Rate Limiting & Quotas
```typescript
// Rate Limiting Configuration
interface RateLimits {
  // User API limits
  user_api: {
    requests_per_minute: 60;
    burst_capacity: 10;
    window_size: "1m";
  };
  
  // Plugin API limits
  plugin_api: {
    requests_per_minute: 120;
    data_requests_per_hour: 1000;
    webhook_calls_per_day: 10000;
  };
  
  // AI API limits
  ai_generation: {
    requests_per_hour: 100;
    tokens_per_day: 50000;
    concurrent_requests: 5;
  };
}
```

## API Versioning & Evolution

### Versioning Strategy
```typescript
// API Version Management
interface APIVersioning {
  // URL-based versioning (primary)
  url_pattern: "/api/v{major}/...";
  
  // Header-based versioning (fallback)
  header_pattern: "API-Version: v{major}.{minor}";
  
  // Deprecation timeline
  support_policy: {
    current_version: "v1";
    deprecated_versions: ["v0"];
    sunset_timeline: "6_months";
  };
}

// Backward Compatibility
interface CompatibilityRules {
  breaking_changes: [
    "Remove endpoints",
    "Remove required fields", 
    "Change response schemas",
    "Modify authentication"
  ];
  
  non_breaking_changes: [
    "Add optional fields",
    "Add new endpoints",
    "Extend enum values",
    "Add response fields"
  ];
}
```

### Migration Patterns
```typescript
// API Migration Support
interface MigrationSupport {
  // Version negotiation
  content_negotiation: {
    request_header: "Accept: application/vnd.mosaic.v2+json";
    response_header: "Content-Type: application/vnd.mosaic.v2+json";
  };
  
  // Graceful degradation
  fallback_behavior: {
    unknown_fields: "ignore";
    missing_fields: "use_defaults";
    version_mismatch: "closest_supported";
  };
}
```

## Performance & Caching

### Caching Strategies
```typescript
// HTTP Caching Headers
interface CachingHeaders {
  // Immutable resources
  static_assets: "Cache-Control: public, max-age=31536000, immutable";
  
  // User-specific data
  user_profile: "Cache-Control: private, max-age=300";
  
  // Frequently changing data
  story_list: "Cache-Control: private, max-age=60, must-revalidate";
  
  // Real-time data
  chat_response: "Cache-Control: no-cache, no-store, must-revalidate";
}

// ETags for conditional requests
interface ConditionalRequests {
  etag_generation: "MD5(content + last_modified)";
  if_none_match: "Client sends If-None-Match header";
  response_304: "Return 304 Not Modified if unchanged";
}
```

### Performance Targets
```typescript
// API Performance SLOs
interface PerformanceSLOs {
  // Response time targets (95th percentile)
  read_operations: "< 200ms";
  write_operations: "< 400ms";
  search_queries: "< 500ms";
  ai_generation: "< 5000ms";
  
  // Throughput targets
  requests_per_second: 1000;
  concurrent_connections: 5000;
  
  // Availability targets
  uptime_slo: "99.9%";
  error_rate_slo: "< 0.1%";
}
```

## Observability & Monitoring

### API Monitoring
```typescript
// Metrics Collection
interface APIMetrics {
  // Request metrics
  http_requests_total: "Counter by method, endpoint, status";
  http_request_duration: "Histogram by endpoint";
  http_requests_in_flight: "Gauge of concurrent requests";
  
  // Business metrics  
  stories_created_total: "Counter by legacy_id";
  ai_tokens_generated_total: "Counter by model, tenant";
  plugin_api_calls_total: "Counter by plugin_id, endpoint";
  
  // Error tracking
  http_errors_total: "Counter by endpoint, error_code";
  plugin_errors_total: "Counter by plugin_id, error_type";
}

// Distributed Tracing
interface TracingStrategy {
  trace_headers: ["traceparent", "tracestate"];
  span_naming: "{service}.{method} {endpoint}";
  trace_sampling: "10% for normal requests, 100% for errors";
  
  // Cross-service correlation
  request_id_propagation: "X-Request-ID header";
  user_context_propagation: "X-User-Context header (internal)";
}
```

### Health Check Standards
```yaml
# Health Check Endpoints
GET /health                                         # Simple liveness check
GET /health/ready                                   # Readiness with dependencies
GET /health/detailed                                # Detailed system status

# Health Check Response Format
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2025-09-24T10:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": {"status": "healthy", "latency": "5ms"},
    "cache": {"status": "healthy", "hit_rate": "85%"},
    "external_api": {"status": "degraded", "error": "timeout"}
  }
}
```

## Development & Testing

### API Development Workflow
```typescript
// Contract-First Development
interface DevelopmentWorkflow {
  // 1. Define OpenAPI spec
  openapi_spec: "Define endpoints, schemas, examples";
  
  // 2. Generate code
  code_generation: {
    server_stubs: "FastAPI route stubs";
    client_libraries: "TypeScript API clients";
    type_definitions: "Shared type packages";
  };
  
  // 3. Implement & test
  implementation: "Fill in business logic";
  contract_testing: "Validate against OpenAPI spec";
  integration_testing: "Test cross-service interactions";
}
```

### Testing Strategies
```typescript
// API Testing Layers
interface TestingLayers {
  // Unit tests
  unit_tests: {
    scope: "Individual endpoint logic";
    mocking: "Mock external dependencies";
    coverage_target: "90%";
  };
  
  // Contract tests
  contract_tests: {
    scope: "API specification compliance";
    tools: ["schemathesis", "dredd"];
    validation: "Request/response schema validation";
  };
  
  // Integration tests
  integration_tests: {
    scope: "Cross-service API interactions";
    environment: "Test cluster with real databases";
    scenarios: "End-to-end user workflows";
  };
  
  // Load tests
  load_tests: {
    scope: "Performance under load";
    tools: ["k6", "artillery"];
    scenarios: "Peak traffic simulation";
  };
}
```

## API Documentation Standards

### OpenAPI Specification
```yaml
# OpenAPI 3.1 Structure
openapi: "3.1.0"
info:
  title: "Mosaic Life API"
  version: "1.0.0"
  description: "Digital legacy preservation platform API"
  contact:
    name: "Mosaic Life Team"
    url: "https://github.com/mosaic-stories/mosaic-life"
  license:
    name: "MIT"
    url: "https://opensource.org/licenses/MIT"

# Security schemes
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    CookieAuth:
      type: apiKey
      in: cookie
      name: mosaic_session

# Global security requirement
security:
  - CookieAuth: []
  - BearerAuth: []
```

### Documentation Guidelines
```typescript
// API Documentation Standards
interface DocumentationStandards {
  // Endpoint documentation
  endpoint_docs: {
    summary: "Brief description (< 50 chars)";
    description: "Detailed explanation with examples";
    parameters: "Full parameter documentation with constraints";
    responses: "All possible responses with examples";
    errors: "Common error scenarios and codes";
  };
  
  // Schema documentation
  schema_docs: {
    properties: "Document all fields with validation rules";
    examples: "Provide realistic example values";
    relationships: "Document foreign key relationships";
    business_rules: "Explain validation and business logic";
  };
}
```

This comprehensive API Design document serves as the authoritative reference for all API-related architecture decisions in Mosaic Life, ensuring consistency across development teams and providing clear guidelines for API implementation, testing, and evolution.
