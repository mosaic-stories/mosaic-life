# Local Development Fixes - October 2025

## Issues Fixed

### 1. CSP Error and Port Mismatch
**Problem:** 
- nginx.conf was listening on port 8080 but Dockerfile exposed port 80
- CSP included `http://core-api:8080` which browsers couldn't resolve
- This caused the local Docker Compose app to not work properly

**Solution:**
- Changed nginx to listen on port 80 (matching Dockerfile EXPOSE)
- Updated CSP `connect-src` to only allow `'self'` since all API calls are proxied through `/api/`
- This allows the browser to connect only to the same origin

### 2. Docker Build Issues
**Problem:** 
- node_modules was being copied into Docker build context causing conflicts

**Solution:**
- Created `.dockerignore` file to exclude node_modules, test results, and other unnecessary files

### 3. Development Experience
**Problem:** 
- Only Docker Compose mode was available, which is slow for rapid iteration

**Solution:**
- Added `just dev` command to run Vite dev server with HMR
- Added `just dev-backend` to run only backend services
- Preserved `just start` for full-stack Docker testing

## Development Modes

### Mode 1: Vite Dev Server (Recommended for development)
```bash
# Terminal 1: Start backend services
just dev-backend

# Terminal 2: Start Vite dev server
just dev
```

**Benefits:**
- ⚡ Hot Module Reload (HMR) - instant updates
- 🐛 Better debugging experience
- 🚀 Fast iteration cycle
- Uses development CSP with unsafe-eval for Vite

**Access:** http://localhost:5173

### Mode 2: Full Docker Compose Stack (For integration testing)
```bash
just start
```

**Benefits:**
- 🐳 Production-like environment
- 🔒 Production CSP and nginx configuration
- 🧪 Test the full stack together

**Access:** http://localhost:3001 or http://beelink.projecthewitt.info:3001

### Mode 3: Production Deployment
```bash
just deploy
```

**Benefits:**
- ☸️ Kubernetes deployment
- 🌐 Full production environment with ALB, DNS, etc.

**Access:** https://mosaiclife.me

## Files Changed

1. **apps/web/nginx.conf**
   - Changed `listen 8080` → `listen 80`
   - Changed CSP `connect-src 'self' http://core-api:8080` → `connect-src 'self'`

2. **apps/web/.dockerignore** (new file)
   - Excludes node_modules, test results, cache files

3. **justfile**
   - Added `dev` command for Vite dev server
   - Added `dev-backend` command for backend-only services
   - Updated `dev-up` documentation

## Testing the Fix

1. **Stop existing containers:**
   ```bash
   just stop
   ```

2. **Start with fixed configuration:**
   ```bash
   just start
   ```

3. **Verify:**
   - Open http://localhost:3001 (or http://beelink.projecthewitt.info:3001)
   - Check browser console - CSP warning should be gone
   - App should look the same as https://mosaiclife.me

## Understanding CSP Warning

The warning "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element" is **informational only** and can be safely ignored. It appears when:
- CSP headers are correctly set via HTTP headers (as we do)
- The browser is just noting that `frame-ancestors` doesn't work in meta tags (which we don't use)

Our CSP is correctly set via nginx HTTP headers, not meta tags, so this warning doesn't affect functionality.

## Next Steps

For day-to-day development:
1. Use `just dev-backend` + `just dev` for fast iteration
2. Use `just start` when you need to test the full Docker stack
3. Both modes now have correct CSP configuration

## Architecture Compliance

✅ Follows FRONTEND-ARCHITECTURE.md - nginx proxy pattern
✅ Follows CODING-STANDARDS.md - proper CSP and security headers
✅ Follows CORE-BACKEND-ARCHITECTURE.md - API proxy through /api/
✅ No changes to architecture - only fixed configuration bugs
