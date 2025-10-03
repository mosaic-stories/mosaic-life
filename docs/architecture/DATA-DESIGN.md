# Mosaic Life - Data Design Architecture

## Overview

This document defines the comprehensive data architecture for Mosaic Life, including database schemas, data storage patterns, plugin data access, and AI data processing strategies. This serves as the authoritative source for all data-related design decisions.

## Database Architecture

### Primary Data Stores

#### PostgreSQL - Relational Data
- **Purpose**: Primary transactional data store
- **Usage**: User accounts, legacies, stories, groups, permissions, audit logs
- **Characteristics**: ACID compliance, structured relationships, complex queries

#### Neo4J - Relationship Graphs  
- **Purpose**: Social connections and relationship modeling
- **Usage**: Person-to-person relationships, story connections, family trees
- **Characteristics**: Graph traversals, relationship analytics, social networks

#### Storage Systems
- **Local Filesystem**: Development and self-hosted deployments
- **S3-Compatible Storage**: Cloud deployments and media assets
- **Redis**: Session management, caching, real-time features

## Core Database Schema Design

### PostgreSQL Schema

#### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    relationship_to_deceased VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_admin BOOLEAN DEFAULT FALSE,
    privacy_preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Indexes
    CONSTRAINT unique_email UNIQUE (email)
);

CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login);
```

#### Legacies Table
```sql
CREATE TABLE legacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    death_date DATE,
    description TEXT,
    profile_images TEXT[], -- Array of image URLs/paths
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    
    -- Indexes
    CONSTRAINT fk_legacies_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_legacies_created_by ON legacies(created_by);
CREATE INDEX idx_legacies_created_at ON legacies(created_at);
CREATE INDEX idx_legacies_person_name ON legacies(person_name);
```

#### Stories Table
```sql
CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id UUID NOT NULL REFERENCES legacies(id),
    submitted_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    story_type VARCHAR(50) NOT NULL DEFAULT 'written', -- written, transcribed, imported, etc.
    visibility_level VARCHAR(20) NOT NULL DEFAULT 'private', -- public, private, group
    tags TEXT[], -- Array of tags
    media_attachments TEXT[], -- Array of media URLs/paths
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT fk_stories_legacy_id FOREIGN KEY (legacy_id) REFERENCES legacies(id) ON DELETE CASCADE,
    CONSTRAINT fk_stories_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id),
    CONSTRAINT fk_stories_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT valid_visibility_level CHECK (visibility_level IN ('public', 'private', 'group')),
    CONSTRAINT valid_story_type CHECK (story_type IN ('written', 'transcribed', 'imported', 'sms', 'email', 'audio'))
);

CREATE INDEX idx_stories_legacy_id ON stories(legacy_id);
CREATE INDEX idx_stories_submitted_by ON stories(submitted_by);
CREATE INDEX idx_stories_created_at ON stories(created_at);
CREATE INDEX idx_stories_visibility_level ON stories(visibility_level);
CREATE INDEX idx_stories_story_type ON stories(story_type);
CREATE INDEX idx_stories_tags ON stories USING GIN(tags);
CREATE INDEX idx_stories_content_fts ON stories USING GIN(to_tsvector('english', content));
CREATE INDEX idx_stories_title_fts ON stories USING GIN(to_tsvector('english', title));
```

#### Groups Table
```sql
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id UUID NOT NULL REFERENCES legacies(id),
    name VARCHAR(255) NOT NULL, -- e.g., "Family", "Coworkers", "College Friends"
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    members UUID[] NOT NULL DEFAULT '{}', -- Array of user_ids
    
    -- Constraints
    CONSTRAINT fk_groups_legacy_id FOREIGN KEY (legacy_id) REFERENCES legacies(id) ON DELETE CASCADE,
    CONSTRAINT fk_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT unique_group_name_per_legacy UNIQUE (legacy_id, name)
);

CREATE INDEX idx_groups_legacy_id ON groups(legacy_id);
CREATE INDEX idx_groups_created_by ON groups(created_by);
CREATE INDEX idx_groups_members ON groups USING GIN(members);
```

#### AI Conversations Table
```sql
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id UUID NOT NULL REFERENCES legacies(id),
    user_id UUID NOT NULL REFERENCES users(id),
    conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_conversations_legacy_id FOREIGN KEY (legacy_id) REFERENCES legacies(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversations_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversations_legacy_id ON ai_conversations(legacy_id);
CREATE INDEX idx_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON ai_conversations(updated_at);
```

### Neo4J Graph Schema

#### Node Types
```cypher
// Person nodes - represent individuals in the system
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;

(:Person {
    id: "uuid",
    name: "string",
    relationship_type: "string", // friend, family, coworker, etc.
    legacy_id: "uuid", // Reference to PostgreSQL legacy
    user_id: "uuid" // Reference to PostgreSQL user (if they have an account)
})

// Story nodes - represent individual stories
CREATE CONSTRAINT story_id IF NOT EXISTS FOR (s:Story) REQUIRE s.id IS UNIQUE;

(:Story {
    id: "uuid", // Matches PostgreSQL stories.id
    title: "string",
    content: "string",
    tags: ["array", "of", "tags"],
    created_at: "datetime",
    story_type: "string"
})

// Legacy nodes - represent the deceased person
CREATE CONSTRAINT legacy_id IF NOT EXISTS FOR (l:Legacy) REQUIRE l.id IS UNIQUE;

(:Legacy {
    id: "uuid", // Matches PostgreSQL legacies.id
    name: "string"
})

// Plugin nodes - represent installed plugins
CREATE CONSTRAINT plugin_id IF NOT EXISTS FOR (p:Plugin) REQUIRE p.id IS UNIQUE;

(:Plugin {
    id: "uuid",
    name: "string",
    version: "string",
    capabilities: ["array", "of", "capabilities"]
})
```

#### Relationship Types
```cypher
// Social relationships between people
(:Person)-[:KNEW {since: "date", context: "string"}]->(:Person)
(:Person)-[:FAMILY_OF {relationship: "string"}]->(:Person) // spouse, child, sibling, etc.
(:Person)-[:WORKED_WITH {company: "string", period: "string"}]->(:Person)
(:Person)-[:FRIENDS_WITH {since: "date", context: "string"}]->(:Person)

// Story relationships
(:Person)-[:SUBMITTED {date: "datetime"}]->(:Story)
(:Story)-[:ABOUT]->(:Legacy)
(:Story)-[:MENTIONS]->(:Person)
(:Story)-[:RELATED_TO {similarity_score: "float"}]->(:Story)

// Plugin relationships
(:Plugin)-[:PROCESSES {permission_level: "string"}]->(:Story)
(:Plugin)-[:ENHANCES {feature_type: "string"}]->(:Legacy)
(:Plugin)-[:ACCESSES {scope: "array"}]->(:Person)
```

## Plugin Database Access Patterns

### Read-Only Access Pattern
Plugins access data through the Core API with scoped permissions (see API-DESIGN.md for complete plugin API specification):

```python
# Plugin data access via Core API
class PluginDataAccess:
    def __init__(self, plugin_token: str, core_api_url: str):
        self.token = plugin_token
        self.api_url = core_api_url
    
    async def get_stories(self, legacy_id: str, filters: dict = None):
        """Get stories accessible to this plugin for a specific legacy."""
        headers = {"Authorization": f"Bearer {self.token}"}
        params = {"legacy_id": legacy_id, **filters}
        
        response = await httpx.get(
            f"{self.api_url}/v1/plugins/data/stories",
            headers=headers,
            params=params
        )
        return response.json()
```

### Data Augmentation Pattern
Plugins can add metadata to stories through standardized extension fields:

```sql
-- Plugin metadata extension table
CREATE TABLE story_plugin_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    plugin_id VARCHAR(100) NOT NULL,
    metadata_type VARCHAR(50) NOT NULL, -- sentiment, keywords, categories, etc.
    metadata_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_plugin_story_type UNIQUE (story_id, plugin_id, metadata_type)
);

CREATE INDEX idx_story_plugin_metadata_story_id ON story_plugin_metadata(story_id);
CREATE INDEX idx_story_plugin_metadata_plugin_id ON story_plugin_metadata(plugin_id);
CREATE INDEX idx_story_plugin_metadata_type ON story_plugin_metadata(metadata_type);
```

### Event-Driven Updates Pattern
Plugins receive story/legacy events via webhooks and process asynchronously:

```python
# Event payload structure
class StoryEvent:
    event_type: str  # created, updated, deleted, approved
    story_id: str
    legacy_id: str
    user_id: str
    timestamp: datetime
    changes: dict  # For update events
    
# Plugin webhook endpoint
@app.post("/webhook/story-events")
async def handle_story_event(event: StoryEvent, plugin_auth: PluginAuth):
    # Verify plugin permissions for this legacy
    if not await verify_plugin_access(plugin_auth.plugin_id, event.legacy_id):
        raise HTTPException(403, "Plugin not authorized for this legacy")
    
    # Process the event
    await process_story_event(event)
```

### Tenant Isolation Pattern
All plugin queries are automatically scoped to the requesting tenant/legacy:

```python
# Automatic tenant scoping middleware
class TenantScopingMiddleware:
    async def scope_query(self, query: Query, user_context: UserContext):
        # Add tenant/legacy filters to all queries
        if hasattr(query, 'legacy_id'):
            accessible_legacies = await get_user_accessible_legacies(user_context.user_id)
            query = query.filter(legacy_id__in=accessible_legacies)
        
        return query
```

## AI Data Processing Architecture

### Persona Development Data Flow

#### 1. Data Aggregation
```python
def collect_persona_data(legacy_id: str) -> PersonaData:
    """Collect all available data for persona generation."""
    return PersonaData(
        stories=get_all_stories(legacy_id),
        writing_samples=extract_writing_samples(legacy_id),
        preferences=extract_preferences_from_stories(legacy_id),
        relationships=get_relationship_graph(legacy_id),
        timeline=build_life_timeline(legacy_id)
    )
```

#### 2. Privacy-Aware AI Data Access
```python
def generate_response(user_id: str, message: str, legacy_id: str) -> AIResponse:
    """Generate AI response with privacy-aware data access."""
    
    # Get user's accessible stories (privacy-filtered)
    accessible_stories = get_user_accessible_stories(user_id, legacy_id)
    
    # Generate full persona from all stories (for personality modeling)
    full_persona = generate_persona(get_all_stories(legacy_id))
    
    # Query only accessible stories for specific examples/context
    relevant_memories = mcp_agent.query(accessible_stories, message)
    
    # Generate response using full persona but accessible examples only
    return ai_model.generate(
        system_prompt=full_persona,
        context=relevant_memories,
        user_message=message
    )
```

#### 3. Conversation History Storage
```python
class ConversationManager:
    async def store_conversation_turn(
        self, 
        conversation_id: str, 
        user_message: str, 
        ai_response: str,
        metadata: dict
    ):
        """Store conversation turn with metadata."""
        turn = {
            "timestamp": datetime.utcnow().isoformat(),
            "user_message": user_message,
            "ai_response": ai_response,
            "metadata": {
                "model_used": metadata.get("model"),
                "response_time": metadata.get("response_time"),
                "stories_referenced": metadata.get("story_ids", []),
                "confidence_score": metadata.get("confidence")
            }
        }
        
        await self.append_to_conversation(conversation_id, turn)
```

## Data Security and Privacy

### Access Control Layers

#### 1. Story Visibility Controls
```sql
-- Story visibility levels with access matrix
CREATE TYPE visibility_level AS ENUM ('public', 'private', 'group', 'family_only');

-- Access control function
CREATE OR REPLACE FUNCTION user_can_access_story(
    p_user_id UUID, 
    p_story_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    story_visibility visibility_level;
    story_legacy_id UUID;
    story_submitted_by UUID;
BEGIN
    SELECT visibility_level, legacy_id, submitted_by 
    INTO story_visibility, story_legacy_id, story_submitted_by
    FROM stories 
    WHERE id = p_story_id;
    
    -- Story submitter can always access
    IF story_submitted_by = p_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Legacy admin can always access
    IF EXISTS (
        SELECT 1 FROM legacies 
        WHERE id = story_legacy_id AND created_by = p_user_id
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Check visibility level specific rules
    CASE story_visibility
        WHEN 'public' THEN
            RETURN TRUE;
        WHEN 'private' THEN
            RETURN FALSE;
        WHEN 'group' THEN
            RETURN EXISTS (
                SELECT 1 FROM groups g
                WHERE g.legacy_id = story_legacy_id 
                AND p_user_id = ANY(g.members)
            );
        WHEN 'family_only' THEN
            -- Implement family relationship check
            RETURN check_family_relationship(p_user_id, story_legacy_id);
    END CASE;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
```

#### 2. Plugin Permission Model
```sql
-- Plugin permissions table
CREATE TABLE plugin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id VARCHAR(100) NOT NULL,
    legacy_id UUID NOT NULL REFERENCES legacies(id),
    permissions JSONB NOT NULL, -- Capability-based permissions
    granted_by UUID NOT NULL REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_plugin_legacy UNIQUE (plugin_id, legacy_id)
);

-- Example permission structure
{
    "read_stories": ["public", "group"],
    "write_metadata": ["sentiment", "keywords"],
    "access_relationships": false,
    "webhook_events": ["story.created", "story.updated"]
}
```

### Data Encryption

#### At Rest Encryption
```yaml
# Database encryption configuration
postgresql:
  encryption:
    method: "AES-256"
    key_management: "AWS KMS" # or local key for self-hosted
    encrypted_columns:
      - users.privacy_preferences
      - stories.content (if sensitive)
      - ai_conversations.conversation_history

file_storage:
  encryption:
    method: "AES-256-GCM"
    key_rotation: "quarterly"
    encrypted_file_types:
      - images
      - audio_files
      - documents
```

#### In Transit Encryption
- All API communications over HTTPS/TLS 1.3
- Database connections encrypted with SSL
- Plugin communications via mutual TLS
- Internal service mesh with automatic encryption

## Performance Optimization Patterns

### Database Performance

#### 1. Indexing Strategy
```sql
-- Composite indexes for common query patterns
CREATE INDEX idx_stories_legacy_visibility_created 
ON stories(legacy_id, visibility_level, created_at DESC);

CREATE INDEX idx_stories_user_type_created
ON stories(submitted_by, story_type, created_at DESC);

-- Partial indexes for common filters
CREATE INDEX idx_stories_approved 
ON stories(approved_at) 
WHERE approved_by IS NOT NULL;

CREATE INDEX idx_stories_pending_approval
ON stories(created_at) 
WHERE approved_by IS NULL;
```

#### 2. Caching Layers
```python
# Redis caching strategy
class DataCacheManager:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.cache_ttl = {
            "user_permissions": 300,  # 5 minutes
            "story_metadata": 1800,   # 30 minutes
            "legacy_settings": 3600,  # 1 hour
            "ai_personas": 7200       # 2 hours
        }
    
    async def cache_user_accessible_stories(self, user_id: str, legacy_id: str, story_ids: list):
        key = f"user_stories:{user_id}:{legacy_id}"
        await self.redis.setex(key, self.cache_ttl["user_permissions"], json.dumps(story_ids))
```

#### 3. Query Optimization
```python
# Optimized data access patterns
class OptimizedStoryQuery:
    def get_stories_with_metadata(self, legacy_id: str, user_id: str, limit: int = 20):
        """Fetch stories with plugin metadata in single query."""
        return (
            session.query(Story)
            .options(
                selectinload(Story.plugin_metadata),
                selectinload(Story.media_attachments)
            )
            .join(
                # Subquery for user accessibility check
                select([story_access_subquery])
                .where(story_access_subquery.c.user_id == user_id)
            )
            .filter(Story.legacy_id == legacy_id)
            .order_by(Story.created_at.desc())
            .limit(limit)
        )
```

## Migration and Versioning Strategy

### Schema Evolution
```python
# Alembic migration example for plugin metadata
def upgrade():
    # Add plugin metadata support
    op.create_table(
        'story_plugin_metadata',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('story_id', sa.UUID(), nullable=False),
        sa.Column('plugin_id', sa.VARCHAR(100), nullable=False),
        sa.Column('metadata_type', sa.VARCHAR(50), nullable=False),
        sa.Column('metadata_value', postgresql.JSONB(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('story_id', 'plugin_id', 'metadata_type')
    )
    
    # Migrate existing data
    op.execute("""
        INSERT INTO story_plugin_metadata (story_id, plugin_id, metadata_type, metadata_value)
        SELECT id, 'core', 'tags', json_build_object('tags', tags)
        FROM stories 
        WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
    """)

def downgrade():
    op.drop_table('story_plugin_metadata')
```

### Data Backup and Recovery
```yaml
backup_strategy:
  postgresql:
    frequency: "daily"
    retention: "30 days"
    method: "pg_dump with compression"
    encryption: "GPG encryption"
    
  neo4j:
    frequency: "daily"
    retention: "30 days"
    method: "neo4j-backup"
    
  file_storage:
    frequency: "continuous"
    method: "incremental snapshots"
    retention: "90 days"
    
restore_procedures:
  point_in_time_recovery: "enabled"
  cross_region_backup: "enabled for cloud deployments"
  disaster_recovery_rto: "< 4 hours"
  disaster_recovery_rpo: "< 1 hour"
```

## Monitoring and Observability

### Data Quality Metrics
```python
# Data quality monitoring
class DataQualityMonitor:
    def check_story_completeness(self):
        """Monitor for incomplete story records."""
        incomplete_stories = session.query(Story).filter(
            or_(
                Story.title.is_(None),
                Story.content == "",
                Story.legacy_id.is_(None)
            )
        ).count()
        
        self.metrics.gauge("data_quality.incomplete_stories", incomplete_stories)
    
    def check_orphaned_metadata(self):
        """Monitor for orphaned plugin metadata."""
        orphaned_count = session.query(StoryPluginMetadata).filter(
            ~exists().where(Story.id == StoryPluginMetadata.story_id)
        ).count()
        
        self.metrics.gauge("data_quality.orphaned_metadata", orphaned_count)
```

### Performance Monitoring
```python
# Database performance metrics
class DatabaseMetrics:
    def track_query_performance(self):
        slow_queries = session.execute("""
            SELECT query, mean_exec_time, calls 
            FROM pg_stat_statements 
            WHERE mean_exec_time > 1000 
            ORDER BY mean_exec_time DESC 
            LIMIT 10
        """).fetchall()
        
        for query in slow_queries:
            self.metrics.histogram(
                "database.slow_query_time", 
                query.mean_exec_time,
                tags={"query_hash": hash(query.query)}
            )
```

This comprehensive data design document serves as the authoritative reference for all data-related architecture decisions in Mosaic Life, ensuring consistency across the development team and providing clear guidelines for future enhancements.
