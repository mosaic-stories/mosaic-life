# API Overview

The Mosaic Life API is a RESTful HTTP API built with FastAPI.

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://api.mosaiclife.me` |
| Staging | `https://stage-api.mosaiclife.me` |
| Local | `http://localhost:8080` |

## Authentication

The API uses session-based authentication with Google OAuth.

1. Initiate login: `GET /auth/login`
2. Complete OAuth flow
3. Session cookie set automatically

## Request Format

```bash
curl -X GET https://api.mosaiclife.me/legacies \
  -H "Content-Type: application/json" \
  --cookie "session=..."
```

## Response Format

All responses follow this structure:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "abc123"
  }
}
```

## Error Handling

Errors return appropriate HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not logged in |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Error - Server issue |

## Rate Limiting

API requests are limited to 100 requests per minute per user.
