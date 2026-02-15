# Bedrock Guardrails Design (Phase 2)

**Date:** 2025-12-08
**Status:** Approved
**Phase:** 2 of 3

## Overview

Add AWS Bedrock Guardrails to the AI chat feature to provide a general safety net for content filtering. This builds on the Phase 1 implementation (streaming chat with Biographer/Friend personas) by adding input/output content moderation.

## Decisions Summary

| Topic | Decision |
|-------|----------|
| Scope | General safety net (content filters only) |
| Deployment | CDK for both staging and prod |
| Filter strengths | Low/Medium initial (grief-friendly) |
| Configuration | Environment variables (optional for local dev) |
| L1 vs L2 construct | L1 CfnGuardrail (stable) |

---

## Content Filter Configuration

| Category | Input Strength | Output Strength | Notes |
|----------|---------------|-----------------|-------|
| HATE | MEDIUM | MEDIUM | Blocks hate speech/discrimination |
| VIOLENCE | LOW | LOW | Permits grief discussions, blocks graphic content |
| SEXUAL | HIGH | HIGH | Block explicit content |
| INSULTS | LOW | LOW | Permissive - users may express frustration |
| MISCONDUCT | MEDIUM | MEDIUM | Blocks illegal activity guidance |
| PROMPT_ATTACK | MEDIUM | N/A | Blocks jailbreak attempts |

**Blocked message (input):** "I can't process that request. Please rephrase your message."

**Blocked message (output):** "I'm not able to respond to that. Let me help you with something else."

---

## Architecture

```
┌─────────────┐     POST /conversations/{id}/messages      ┌─────────────┐
│   Browser   │ ──────────────────────────────────────────▶│  Core API   │
└─────────────┘                                            └──────┬──────┘
                                                                  │
                                                   ┌──────────────▼──────────────┐
                                                   │ BedrockAdapter.stream_generate │
                                                   │                              │
                                                   │  invoke_model_with_response_stream(
                                                   │    modelId=...,
                                                   │    body=...,
                                                   │    guardrailIdentifier="gr-xxx",
                                                   │    guardrailVersion="1"
                                                   │  )                           │
                                                   └──────────────┬───────────────┘
                                                                  │
                                          ┌───────────────────────▼───────────────────────┐
                                          │              AWS Bedrock                       │
                                          │  ┌─────────────────────────────────────────┐  │
                                          │  │         Guardrail (Input Check)         │  │
                                          │  │  • Content filters (hate, violence...)  │  │
                                          │  │  • Prompt attack detection              │  │
                                          │  └────────────────┬────────────────────────┘  │
                                          │                   │ (if passes)               │
                                          │  ┌────────────────▼────────────────────────┐  │
                                          │  │         Foundation Model                │  │
                                          │  │     (Claude Sonnet 4.5)                 │  │
                                          │  └────────────────┬────────────────────────┘  │
                                          │                   │                           │
                                          │  ┌────────────────▼────────────────────────┐  │
                                          │  │        Guardrail (Output Check)         │  │
                                          │  │  • Content filters on response          │  │
                                          │  └────────────────┬────────────────────────┘  │
                                          └───────────────────┼───────────────────────────┘
                                                              │
                                                              ▼
                                                    SSE stream to browser
                                            (or blocked message if filtered)
```

### Configuration Flow

```
CDK Stack                    Helm Values                   Python App
───────────                  ───────────                   ──────────
CfnGuardrail                 env:                          settings.py
  └─► guardrailId    ───►      BEDROCK_GUARDRAIL_ID   ───►   guardrail_id
  └─► version        ───►      BEDROCK_GUARDRAIL_VERSION ─►   guardrail_version
```

---

## CDK Implementation

### Shared Construct

**File:** `infra/cdk/lib/guardrail-construct.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface AIChatGuardrailProps {
  environment: string;
}

export class AIChatGuardrail extends Construct {
  public readonly guardrailId: string;
  public readonly guardrailVersion: string;
  public readonly guardrailArn: string;

  constructor(scope: Construct, id: string, props: AIChatGuardrailProps) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'AIGuardrail', {
      name: `mosaic-${props.environment}-ai-chat-guardrail`,
      description: 'Content safety guardrail for AI chat feature',

      blockedInputMessaging: "I can't process that request. Please rephrase your message.",
      blockedOutputsMessaging: "I'm not able to respond to that. Let me help you with something else.",

      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'VIOLENCE', inputStrength: 'LOW', outputStrength: 'LOW' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'LOW', outputStrength: 'LOW' },
          { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'PROMPT_ATTACK', inputStrength: 'MEDIUM', inputAction: 'BLOCK' },
        ],
      },

      tags: [
        { key: 'Environment', value: props.environment },
        { key: 'Component', value: 'AI-Chat' },
      ],
    });

    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'AIGuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: 'Initial version',
    });

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailVersion = guardrailVersion.attrVersion;
    this.guardrailArn = guardrail.attrGuardrailArn;
  }
}
```

### Stack Integration

Add to `MosaicLifeStack` (both staging and prod):

```typescript
const aiGuardrail = new AIChatGuardrail(this, 'AIChatGuardrail', {
  environment,
});

// Update IAM policy for core-api role
coreApiRole.addToPolicy(
  new iam.PolicyStatement({
    sid: 'AllowBedrockGuardrail',
    effect: iam.Effect.ALLOW,
    actions: ['bedrock:ApplyGuardrail'],
    resources: [aiGuardrail.guardrailArn],
  })
);

// Outputs for Helm values
new cdk.CfnOutput(this, 'AIGuardrailId', {
  value: aiGuardrail.guardrailId,
  exportName: `mosaic-${environment}-ai-guardrail-id`,
});

new cdk.CfnOutput(this, 'AIGuardrailVersion', {
  value: aiGuardrail.guardrailVersion,
  exportName: `mosaic-${environment}-ai-guardrail-version`,
});
```

---

## Backend Implementation

### Settings

**File:** `services/core-api/app/config/settings.py`

```python
# Bedrock Guardrails (optional - if not set, guardrails are disabled)
bedrock_guardrail_id: str | None = Field(default=None, alias="BEDROCK_GUARDRAIL_ID")
bedrock_guardrail_version: str | None = Field(default=None, alias="BEDROCK_GUARDRAIL_VERSION")
```

### BedrockAdapter

**File:** `services/core-api/app/adapters/bedrock.py`

Update `stream_generate` signature:

```python
async def stream_generate(
    self,
    messages: list[dict[str, str]],
    system_prompt: str,
    model_id: str,
    max_tokens: int = 1024,
    guardrail_id: str | None = None,
    guardrail_version: str | None = None,
) -> AsyncGenerator[str, None]:
```

Add guardrail params to API call:

```python
invoke_params = {
    "modelId": model_id,
    "contentType": "application/json",
    "accept": "application/json",
    "body": json.dumps(request_body),
}

if guardrail_id and guardrail_version:
    invoke_params["guardrailIdentifier"] = guardrail_id
    invoke_params["guardrailVersion"] = guardrail_version

response = await client.invoke_model_with_response_stream(**invoke_params)
```

Handle guardrail intervention in stream:

```python
elif chunk_type == "amazon-bedrock-guardrailAction":
    if chunk.get("action") == "INTERVENED":
        raise BedrockError(
            "Your message was filtered for safety. Please rephrase.",
            retryable=False,
        )
```

### Routes

**File:** `services/core-api/app/routes/ai.py`

Pass guardrail config from settings:

```python
from ..config.settings import get_settings

settings = get_settings()
async for chunk in adapter.stream_generate(
    messages=context,
    system_prompt=system_prompt,
    model_id=persona.model_id,
    max_tokens=persona.max_tokens,
    guardrail_id=settings.bedrock_guardrail_id,
    guardrail_version=settings.bedrock_guardrail_version,
):
```

---

## Helm Configuration

### Base values

**File:** `infra/helm/core-api/values.yaml`

```yaml
env:
  AWS_REGION: "us-east-1"
  BEDROCK_GUARDRAIL_ID: ""
  BEDROCK_GUARDRAIL_VERSION: ""
```

### Environment overrides

Staging and production values populated from CDK outputs.

### Local development

Guardrail variables unset in docker-compose (guardrails disabled locally).

---

## Deployment Order

1. Deploy CDK (staging + prod) → Creates guardrails, outputs IDs
2. Update Helm values with guardrail IDs from CDK outputs
3. ArgoCD syncs → core-api picks up new env vars
4. Verify → Test guardrails are applied

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `infra/cdk/lib/guardrail-construct.ts` | Create | Shared guardrail construct |
| `infra/cdk/lib/mosaic-life-stack.ts` | Modify | Add guardrail + IAM policy + outputs |
| `services/core-api/app/config/settings.py` | Modify | Add guardrail env vars |
| `services/core-api/app/adapters/bedrock.py` | Modify | Add guardrail params to API call |
| `services/core-api/app/routes/ai.py` | Modify | Pass guardrail config from settings |
| `services/core-api/tests/adapters/test_bedrock.py` | Modify | Add tests for guardrail params |
| `infra/helm/core-api/values.yaml` | Modify | Add guardrail env placeholders |

---

## Testing Strategy

1. **Unit tests** - Mock guardrail params passed to boto3 call
2. **Local dev** - Guardrails disabled (no env vars), AI chat works normally
3. **Staging deploy** - Full integration test with real guardrail
4. **Manual verification** - Send test messages that should be blocked

---

## Future Enhancements (Not in Phase 2)

Captured for later when controls need tightening:

- **Denied topics** - Custom topics for memorial context (e.g., "impersonating deceased")
- **PII filtering** - Detect/mask sensitive information
- **Word blocklist** - Specific terms to block
- **Incident logging** - `ai_incidents` table for blocked content review
- **UI feedback** - "Report" button for users to flag responses
