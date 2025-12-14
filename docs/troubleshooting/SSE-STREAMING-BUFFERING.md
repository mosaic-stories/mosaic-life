# SSE Streaming Buffering Issue in Staging/Production

**Status:** Resolved
**Created:** 2025-12-12
**Resolved:** 2025-12-13
**Environment:** Staging (stage.mosaiclife.me)
**Affected Feature:** AI Chat streaming responses

## Solution Summary

The root cause was **Bedrock Guardrails in synchronous mode**. The `invoke_model_with_response_stream` API only supports sync guardrails, which buffer the entire response before streaming to apply content filtering. The fix was migrating to the `converse_stream` API with `streamProcessingMode: "async"`, which streams chunks immediately while guardrails scan asynchronously in the background.

**Key Insight:** The buffering was NOT caused by ALB, nginx, or network configuration. It was caused by the Bedrock API itself when guardrails are enabled in sync mode.

## Files Changed

| File | Change |
|------|--------|
| `services/core-api/app/adapters/bedrock.py` | Migrated from `invoke_model_with_response_stream` to `converse_stream` API |
| `services/core-api/tests/adapters/test_bedrock.py` | Updated tests for new Converse API format |

## Problem Description

Server-Sent Events (SSE) streaming worked correctly in local development (Docker Compose without guardrails) but responses were buffered in staging/production (with Bedrock Guardrails enabled). Instead of seeing the AI response stream character-by-character in real-time, users saw nothing until the complete response arrived all at once.

### Expected Behavior
- User sends a message
- AI response streams in real-time, showing text as it's generated
- Similar to ChatGPT's typing effect

### Actual Behavior (Before Fix)
- User sends a message
- Input shows "Please wait..." with no visible response
- After several seconds (5+ seconds), the complete response appears all at once

## Architecture Overview

```
Browser → ALB (HTTP/2) → Web nginx → core-api (FastAPI/uvicorn) → Bedrock
```

## Root Cause Analysis

### Discovery Process

1. **Initial hypothesis:** Proxy/load balancer buffering
   - Tried: ALB idle timeout, HTTP/1.1 backend protocol, nginx proxy_buffering off
   - Result: None of these fixed the issue

2. **Diagnostic test:** Added timing logs to SSE stream
   - Finding: Initial ping arrived immediately (~164ms)
   - Finding: First Bedrock content arrived after ~5 seconds
   - Conclusion: Delay was in Bedrock processing, not network layer

3. **Root cause identified:** Bedrock Guardrails in sync mode
   - Local dev: No guardrails → streams immediately
   - Staging: Guardrails enabled → buffers until scan complete

### Technical Explanation

The `invoke_model_with_response_stream` API only supports synchronous guardrail processing:

```python
# OLD API - guardrails buffer the entire response
response = await client.invoke_model_with_response_stream(
    modelId=model_id,
    guardrailIdentifier=guardrail_id,  # Forces sync mode
    guardrailVersion=guardrail_version,
    ...
)
```

The `converse_stream` API supports asynchronous guardrail processing:

```python
# NEW API - guardrails scan asynchronously
response = await client.converse_stream(
    modelId=model_id,
    guardrailConfig={
        "guardrailIdentifier": guardrail_id,
        "guardrailVersion": guardrail_version,
        "streamProcessingMode": "async",  # Stream immediately!
        "trace": "enabled",
    },
    ...
)
```

## Trade-offs with Async Guardrails

Per AWS documentation:
- **Pro:** No streaming latency - chunks stream immediately
- **Con:** User may see partial content before guardrail intervenes (if content is blocked mid-stream)
- **Con:** Sensitive information masking not supported in async mode

For our use case, the trade-off is acceptable since guardrail interventions are rare and the UX improvement is significant.

## Troubleshooting Steps Attempted (Did Not Resolve)

These configurations were correct but did not fix the root cause:

1. **ALB idle timeout** - Extended to 3600s (affects connection timeout, not buffering)
2. **ALB backend protocol** - Set to HTTP1 (only affects ALB-to-backend, not Bedrock)
3. **Nginx proxy_buffering off** - Correct config but buffering was in Bedrock
4. **SSE ping/canary message** - Large 2KB ping to force ALB flush (Bedrock was the bottleneck)
5. **asyncio.sleep(0.01)** between yields - Helped packet coalescing but not the root cause

## Verification Commands

```bash
# Test streaming directly to pod (bypassing proxies)
kubectl port-forward -n mosaic-staging svc/core-api 8080:8080

# Monitor Bedrock response timing in logs
kubectl logs -n mosaic-staging -l app=core-api -f | grep bedrock

# Verify streaming works end-to-end
curl -N -H "Authorization: Bearer $TOKEN" \
  https://stage-api.mosaiclife.me/api/ai/conversations/{id}/messages \
  -d '{"content": "Hello"}' -H "Content-Type: application/json"
```

## Related Resources

- [AWS Bedrock Converse API Documentation](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html)
- [Bedrock Guardrails Streaming Modes](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-streaming.html)
- [AWS re:Post - SSE with NextJS](https://repost.aws/questions/QUvIgdC_HUTJiP6R0VxdqSQA/server-sent-events-sse-nextjs-in-amazon)
