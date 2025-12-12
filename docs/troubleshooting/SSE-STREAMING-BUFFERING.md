# SSE Streaming Buffering Issue in Staging/Production

**Status:** Unresolved
**Created:** 2025-12-12
**Environment:** Staging (stage.mosaiclife.me)
**Affected Feature:** AI Chat streaming responses

## Problem Description

Server-Sent Events (SSE) streaming works correctly in local development (Docker Compose) but responses are buffered in staging/production environments. Instead of seeing the AI response stream character-by-character in real-time, users see nothing until the complete response arrives all at once.

### Expected Behavior
- User sends a message
- AI response streams in real-time, showing text as it's generated
- Similar to ChatGPT's typing effect

### Actual Behavior
- User sends a message
- Input shows "Please wait..." with no visible response
- After several seconds, the complete response appears all at once

## Architecture Overview

```
Browser → ALB (HTTP/2) → Web nginx → core-api (FastAPI/uvicorn)
                    ↘
                      → core-api directly (stage-api.mosaiclife.me)
```

### Key Components

1. **Frontend (React):** Uses `fetch` API with `ReadableStream` reader to process SSE chunks
2. **Web nginx:** Proxies `/api/*` requests to core-api service
3. **AWS ALB:** Application Load Balancer with shared ingress group
4. **Core API (FastAPI):** Uses `StreamingResponse` with async generator for SSE

## Troubleshooting Steps Attempted

### 1. ALB Idle Timeout (Partial)

**File:** `/apps/mosaic-life-gitops/environments/staging/values.yaml`

Added ALB annotation for extended timeout:
```yaml
alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600
```

**Result:** Did not resolve buffering issue. This setting affects connection timeout, not response buffering.

### 2. ALB Backend Protocol Version

**File:** `/apps/mosaic-life-gitops/environments/staging/values.yaml`

Added annotation to use HTTP/1.1 for backend connections:
```yaml
alb.ingress.kubernetes.io/backend-protocol-version: HTTP1
```

**Result:** Did not resolve issue. This only affects ALB-to-backend communication, not client-to-ALB which still uses HTTP/2.

### 3. Nginx Proxy Buffering Disabled

**File:** `/apps/mosaic-life/apps/web/nginx.conf`

Added buffering disable directives to `/api/` location:
```nginx
location /api/ {
    # ... existing config ...

    # SSE/Streaming support - disable buffering for real-time responses
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
}
```

**Result:** Did not resolve issue. Nginx is correctly configured but buffering occurs elsewhere.

### 4. FastAPI Response Headers

**File:** `/apps/mosaic-life/services/core-api/app/routes/ai.py`

StreamingResponse includes headers:
```python
return StreamingResponse(
    generate_stream(),
    media_type="text/event-stream",
    headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    },
)
```

**Result:** Headers are correct but `X-Accel-Buffering` only works for nginx, not AWS ALB.

### 5. SSE Ping/Canary Message

**File:** `/apps/mosaic-life/services/core-api/app/routes/ai.py`

Added immediate SSE comment at stream start to force proxy recognition:
```python
async def generate_stream() -> AsyncGenerator[str, None]:
    # Send an immediate ping to establish the stream and prevent proxy buffering
    yield ": ping\n\n"
    # ... rest of stream generation
```

**Result:** Did not resolve issue. ALB still buffers despite immediate data.

## Current Configuration

### Staging Ingress Annotations (core-api)
```yaml
alb.ingress.kubernetes.io/backend-protocol-version: HTTP1
alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600
alb.ingress.kubernetes.io/scheme: internet-facing
alb.ingress.kubernetes.io/target-type: ip
```

### Nginx Configuration
```nginx
location /api/ {
    proxy_pass http://core-api:8080/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
    # ... CORS headers ...
}
```

## Diagnostic Findings

### HTTP/2 on Client Connection
```bash
curl -v https://stage-api.mosaiclife.me/api/ai/personas
# Output shows:
# * ALPN: server accepted h2
# * using HTTP/2
```

The ALB accepts HTTP/2 from clients. HTTP/2 multiplexes streams differently and may contribute to buffering behavior.

### Local Streaming Works
When testing via `kubectl port-forward` directly to the core-api pod, streaming works correctly. This confirms the issue is in the proxy/load balancer layer, not the application code.

### No GZip Middleware
Verified FastAPI has no GZip middleware that could buffer responses:
```
Middleware:
  BaseHTTPMiddleware (metrics)
  SessionMiddleware
  CORSMiddleware
```

## Potential Next Steps

### Option A: Force HTTP/1.1 on ALB Frontend
AWS ALB doesn't have a direct setting to disable HTTP/2 for client connections. May need to:
- Use NLB (Network Load Balancer) instead of ALB
- Use CloudFront with HTTP/1.1 origin protocol

### Option B: Bypass Web Nginx for API
Currently the frontend makes API calls to `/api/*` which nginx proxies. Could configure frontend to call `stage-api.mosaiclife.me` directly for SSE endpoints, bypassing one proxy layer.

**Changes required:**
1. Update CSP `connect-src` to allow `stage-api.mosaiclife.me`
2. Modify `streamMessage()` in `/apps/web/src/lib/api/ai.ts` to use absolute URL for SSE endpoint
3. Handle CORS for cross-origin SSE requests

### Option C: WebSockets Instead of SSE
WebSockets have better proxy support than SSE. Would require:
1. Add WebSocket endpoint to FastAPI
2. Update frontend to use WebSocket for chat
3. Configure ALB for WebSocket support (already supported)

### Option D: Long Polling Fallback
Implement a fallback mechanism:
1. Try SSE first
2. If no data received within timeout, fall back to polling
3. Less elegant but reliable through any proxy

### Option E: CloudFront Investigation
Check if CloudFront is in front of the ALB (check DNS). If so, CloudFront has its own buffering behavior that needs configuration.

```bash
dig stage.mosaiclife.me
# Check if it points to CloudFront distribution or directly to ALB
```

## Related Resources

- [AWS re:Post - SSE with NextJS](https://repost.aws/questions/QUvIgdC_HUTJiP6R0VxdqSQA/server-sent-events-sse-nextjs-in-amazon)
- [DEV Community - SSE Production Issues](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie)
- [AWS Service Connect SSE Debugging](https://www.oliverio.dev/blog/aws-service-connect-sse)
- [ALB HTTP/2 Streaming Support Discussion](https://repost.aws/questions/QUiAoVzdJsQgWP77c0A1aXZg/alb-http-2-streaming-support-to-the-targets)

## Files Modified During Troubleshooting

| File | Change |
|------|--------|
| `/apps/mosaic-life-gitops/environments/staging/values.yaml` | Added ALB annotations |
| `/apps/mosaic-life/apps/web/nginx.conf` | Added proxy_buffering off |
| `/apps/mosaic-life/services/core-api/app/routes/ai.py` | Added SSE ping comment |

## Verification Commands

```bash
# Check ingress annotations are applied
kubectl describe ingress core-api -n mosaic-staging

# Check nginx config in deployed container
kubectl exec -n mosaic-staging deployment/web -- cat /etc/nginx/conf.d/default.conf

# Test streaming directly to pod (bypassing all proxies)
kubectl port-forward -n mosaic-staging svc/core-api 8080:8080
# Then test with curl in another terminal

# Check if HTTP/2 is being used
curl -v https://stage-api.mosaiclife.me/healthz 2>&1 | grep -i http
```
