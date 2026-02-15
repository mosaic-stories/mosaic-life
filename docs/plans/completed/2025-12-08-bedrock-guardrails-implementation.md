# Bedrock Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Bedrock Guardrails to filter AI chat inputs/outputs for content safety.

**Architecture:** Create a CDK construct for the guardrail, update the BedrockAdapter to pass guardrail params to the API, configure via environment variables. Guardrails are optional (disabled if env vars not set) for local development.

**Tech Stack:** AWS CDK (TypeScript), FastAPI (Python), Bedrock Runtime API, pytest

---

## Task 1: Create CDK Guardrail Construct

**Files:**
- Create: `infra/cdk/lib/guardrail-construct.ts`

**Step 1: Create the guardrail construct file**

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

      blockedInputMessaging:
        "I can't process that request. Please rephrase your message.",
      blockedOutputsMessaging:
        "I'm not able to respond to that. Let me help you with something else.",

      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'VIOLENCE', inputStrength: 'LOW', outputStrength: 'LOW' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'LOW', outputStrength: 'LOW' },
          {
            type: 'MISCONDUCT',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM',
          },
          {
            type: 'PROMPT_ATTACK',
            inputStrength: 'MEDIUM',
            inputAction: 'BLOCK',
          },
        ],
      },

      tags: [
        { key: 'Environment', value: props.environment },
        { key: 'Component', value: 'AI-Chat' },
      ],
    });

    const guardrailVersion = new bedrock.CfnGuardrailVersion(
      this,
      'AIGuardrailVersion',
      {
        guardrailIdentifier: guardrail.attrGuardrailId,
        description: 'Initial version',
      }
    );

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailVersion = guardrailVersion.attrVersion;
    this.guardrailArn = guardrail.attrGuardrailArn;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add infra/cdk/lib/guardrail-construct.ts
git commit -m "feat(cdk): add AIChatGuardrail construct for content safety"
```

---

## Task 2: Integrate Guardrail into MosaicLifeStack

**Files:**
- Modify: `infra/cdk/lib/mosaic-life-stack.ts`

**Step 1: Add import at top of file**

After line 12 (`import { Construct } from 'constructs';`), add:

```typescript
import { AIChatGuardrail } from './guardrail-construct';
```

**Step 2: Add guardrail construct after Bedrock permissions (around line 558)**

After the existing Bedrock IAM policy block (after line 558), add:

```typescript
    // ============================================================
    // Bedrock Guardrail for AI Chat
    // ============================================================
    const aiGuardrail = new AIChatGuardrail(this, 'AIChatGuardrail', {
      environment,
    });

    // Grant permission to apply guardrail
    coreApiRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowBedrockGuardrail',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        resources: [aiGuardrail.guardrailArn],
      })
    );
```

**Step 3: Add outputs for guardrail IDs (before the closing brace of constructor)**

Before the final `}` of the constructor (around line 616), add:

```typescript
    new cdk.CfnOutput(this, 'AIGuardrailId', {
      value: aiGuardrail.guardrailId,
      description: 'Bedrock Guardrail ID for AI chat',
      exportName: `mosaic-${environment}-ai-guardrail-id`,
    });

    new cdk.CfnOutput(this, 'AIGuardrailVersion', {
      value: aiGuardrail.guardrailVersion,
      description: 'Bedrock Guardrail Version for AI chat',
      exportName: `mosaic-${environment}-ai-guardrail-version`,
    });
```

**Step 4: Verify TypeScript compiles**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit`
Expected: No errors

**Step 5: Run CDK synth to verify template generation**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth --quiet`
Expected: No errors, template generated

**Step 6: Commit**

```bash
git add infra/cdk/lib/mosaic-life-stack.ts
git commit -m "feat(cdk): integrate AI guardrail into MosaicLifeStack"
```

---

## Task 3: Add Guardrail Settings to Backend

**Files:**
- Modify: `services/core-api/app/config/settings.py`

**Step 1: Add guardrail settings to Settings class**

After line 46 (`ses_region: str = os.getenv("SES_REGION", "us-east-1")`), add:

```python
    # Bedrock Guardrails (optional - disabled if not set)
    bedrock_guardrail_id: str | None = os.getenv("BEDROCK_GUARDRAIL_ID")
    bedrock_guardrail_version: str | None = os.getenv("BEDROCK_GUARDRAIL_VERSION")
```

**Step 2: Verify Python syntax**

Run: `cd /apps/mosaic-life/services/core-api && uv run python -c "from app.config.settings import Settings; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/config/settings.py
git commit -m "feat(api): add Bedrock guardrail settings"
```

---

## Task 4: Write Failing Test for Guardrail Parameters

**Files:**
- Modify: `services/core-api/tests/adapters/test_bedrock.py`

**Step 1: Add test for guardrail parameters passed to API call**

Add the following test class at the end of the file:

```python
class TestGuardrailIntegration:
    """Tests for guardrail integration."""

    @pytest.fixture
    def adapter(self) -> BedrockAdapter:
        """Create adapter instance."""
        return BedrockAdapter(region="us-east-1")

    @pytest.mark.asyncio
    async def test_stream_generate_with_guardrail(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test stream_generate passes guardrail params to API."""

        async def mock_body_iterator():
            events = [
                {
                    "chunk": {
                        "bytes": json.dumps(
                            {"contentBlockDelta": {"delta": {"text": "OK"}}}
                        ).encode()
                    }
                },
                {"chunk": {"bytes": json.dumps({"messageStop": {}}).encode()}},
            ]
            for event in events:
                yield event

        mock_response = {"body": mock_body_iterator()}
        captured_kwargs: dict = {}

        async def capture_invoke(*args, **kwargs):
            nonlocal captured_kwargs
            captured_kwargs = kwargs
            return mock_response

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.invoke_model_with_response_stream = capture_invoke

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                guardrail_id="gr-abc123",
                guardrail_version="1",
            ):
                chunks.append(chunk)

            # Verify guardrail params were passed
            assert captured_kwargs.get("guardrailIdentifier") == "gr-abc123"
            assert captured_kwargs.get("guardrailVersion") == "1"

    @pytest.mark.asyncio
    async def test_stream_generate_without_guardrail(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test stream_generate works without guardrail params."""

        async def mock_body_iterator():
            events = [
                {
                    "chunk": {
                        "bytes": json.dumps(
                            {"contentBlockDelta": {"delta": {"text": "OK"}}}
                        ).encode()
                    }
                },
                {"chunk": {"bytes": json.dumps({"messageStop": {}}).encode()}},
            ]
            for event in events:
                yield event

        mock_response = {"body": mock_body_iterator()}
        captured_kwargs: dict = {}

        async def capture_invoke(*args, **kwargs):
            nonlocal captured_kwargs
            captured_kwargs = kwargs
            return mock_response

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.invoke_model_with_response_stream = capture_invoke

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                # No guardrail params
            ):
                chunks.append(chunk)

            # Verify guardrail params were NOT passed
            assert "guardrailIdentifier" not in captured_kwargs
            assert "guardrailVersion" not in captured_kwargs
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_bedrock.py::TestGuardrailIntegration -v`
Expected: FAIL with `TypeError: stream_generate() got an unexpected keyword argument 'guardrail_id'`

**Step 3: Commit failing test**

```bash
git add services/core-api/tests/adapters/test_bedrock.py
git commit -m "test(api): add failing tests for guardrail parameters"
```

---

## Task 5: Implement Guardrail Parameters in BedrockAdapter

**Files:**
- Modify: `services/core-api/app/adapters/bedrock.py`

**Step 1: Update stream_generate signature (line 64)**

Replace the function signature (lines 64-70):

```python
    async def stream_generate(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model_id: str,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
```

With:

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

**Step 2: Update docstring (after line 70)**

Add these lines to the Args section of the docstring:

```python
            guardrail_id: Optional Bedrock Guardrail ID.
            guardrail_version: Optional Bedrock Guardrail version.
```

**Step 3: Update the invoke call (around line 111)**

Replace the invoke call (lines 111-116):

```python
                    response = await client.invoke_model_with_response_stream(
                        modelId=model_id,
                        contentType="application/json",
                        accept="application/json",
                        body=json.dumps(request_body),
                    )
```

With:

```python
                    invoke_params = {
                        "modelId": model_id,
                        "contentType": "application/json",
                        "accept": "application/json",
                        "body": json.dumps(request_body),
                    }

                    # Add guardrail if configured
                    if guardrail_id and guardrail_version:
                        invoke_params["guardrailIdentifier"] = guardrail_id
                        invoke_params["guardrailVersion"] = guardrail_version
                        logger.info(
                            "bedrock.using_guardrail",
                            extra={
                                "guardrail_id": guardrail_id,
                                "guardrail_version": guardrail_version,
                            },
                        )

                    response = await client.invoke_model_with_response_stream(
                        **invoke_params
                    )
```

**Step 4: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_bedrock.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add services/core-api/app/adapters/bedrock.py
git commit -m "feat(api): add guardrail parameters to BedrockAdapter"
```

---

## Task 6: Update AI Routes to Pass Guardrail Config

**Files:**
- Modify: `services/core-api/app/routes/ai.py`

**Step 1: Add settings import (line 13)**

After line 13 (`from ..adapters.bedrock import BedrockError, get_bedrock_adapter`), add:

```python
from ..config.settings import get_settings
```

**Step 2: Update stream_generate call (lines 227-232)**

Replace the stream_generate call:

```python
                async for chunk in adapter.stream_generate(
                    messages=context,
                    system_prompt=system_prompt,
                    model_id=persona.model_id,
                    max_tokens=persona.max_tokens,
                ):
```

With:

```python
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

**Step 3: Verify Python syntax and run validation**

Run: `cd /apps/mosaic-life && just validate-backend`
Expected: All checks pass

**Step 4: Commit**

```bash
git add services/core-api/app/routes/ai.py
git commit -m "feat(api): pass guardrail config from settings to adapter"
```

---

## Task 7: Add Helm Values for Guardrail

**Files:**
- Modify: `infra/helm/core-api/values.yaml`

**Step 1: Add guardrail environment variables (after line 51)**

After `AWS_REGION: "us-east-1"`, add:

```yaml
  # Bedrock Guardrails (populated from CDK outputs per environment)
  # Leave empty to disable guardrails (e.g., local dev)
  BEDROCK_GUARDRAIL_ID: ""
  BEDROCK_GUARDRAIL_VERSION: ""
```

**Step 2: Commit**

```bash
git add infra/helm/core-api/values.yaml
git commit -m "feat(helm): add Bedrock guardrail environment variables"
```

---

## Task 8: Run Full Backend Validation

**Files:** None (validation only)

**Step 1: Run full validation**

Run: `cd /apps/mosaic-life && just validate-backend`
Expected: All checks pass (ruff, mypy)

**Step 2: Run all tests**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest -v`
Expected: All tests pass

---

## Task 9: Deploy CDK to Staging

**Files:** None (deployment)

**Step 1: Deploy CDK stack**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk deploy --require-approval never`
Expected: Stack deploys successfully, outputs show guardrail ID and version

**Step 2: Note the output values**

Capture the values of:
- `AIGuardrailId`
- `AIGuardrailVersion`

These will be used to update Helm values for staging deployment.

---

## Task 10: Update Staging Helm Values

**Files:** Deployment configuration (location depends on your GitOps setup)

**Step 1: Update staging values with CDK outputs**

Set the environment variables in your staging ArgoCD overlay or values file:
- `BEDROCK_GUARDRAIL_ID: "<guardrail-id-from-cdk-output>"`
- `BEDROCK_GUARDRAIL_VERSION: "<version-from-cdk-output>"`

**Step 2: Sync ArgoCD**

Run: `argocd app sync core-api-staging` (or wait for auto-sync)

**Step 3: Verify deployment**

Check logs for guardrail being applied:
```bash
kubectl logs -n mosaic-staging -l app=core-api --tail=100 | grep guardrail
```
Expected: See `bedrock.using_guardrail` log entries

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create CDK guardrail construct | `infra/cdk/lib/guardrail-construct.ts` |
| 2 | Integrate into MosaicLifeStack | `infra/cdk/lib/mosaic-life-stack.ts` |
| 3 | Add backend settings | `services/core-api/app/config/settings.py` |
| 4 | Write failing tests | `services/core-api/tests/adapters/test_bedrock.py` |
| 5 | Implement guardrail params | `services/core-api/app/adapters/bedrock.py` |
| 6 | Update routes to use settings | `services/core-api/app/routes/ai.py` |
| 7 | Add Helm values | `infra/helm/core-api/values.yaml` |
| 8 | Run full validation | (validation only) |
| 9 | Deploy CDK to staging | (deployment) |
| 10 | Update staging Helm values | (deployment) |

---

## Verification Checklist

After deployment, verify:

- [ ] CDK stack deploys without errors
- [ ] Guardrail appears in AWS Console (Bedrock > Guardrails)
- [ ] Core-api logs show `bedrock.using_guardrail` when AI chat is used
- [ ] Normal messages work without being blocked
- [ ] Test blocked content (e.g., explicit content) returns appropriate error message
