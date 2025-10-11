# AWS Cognito Authentication - Deployment Guide

## Implementation Summary

Full OIDC authentication with AWS Cognito has been implemented following the BFF (Backend-for-Frontend) pattern as specified in the architecture documents.

### What Was Implemented

**Backend (services/core-api):**
- JWT verification with JWKS fetching: `app/auth/cognito.py`
- OIDC endpoints (/login, /callback, /logout): `app/auth/router.py`
- Session middleware with httpOnly cookies: `app/auth/middleware.py`
- Auth models (CognitoUser, SessionData): `app/auth/models.py`
- Configuration management: `app/config.py`

**Frontend (apps/web):**
- Login page with Cognito redirect: `src/App.tsx`
- Auth flow handles callback automatically

**Infrastructure:**
- Docker Compose configuration: `infra/compose/docker-compose.yml`
- Environment template: `infra/compose/.env.example`
- Setup documentation: `infra/compose/README.md`

---

## Required Manual Steps

### 1. Configure OAuth Providers

#### Google OAuth
1. Go to https://console.cloud.google.com/
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI:
   ```
   https://mosaic-prod-033691785857.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
   ```
4. Save Client ID and Client Secret

#### GitHub OAuth
1. Go to https://github.com/settings/developers
2. Create new OAuth App
3. Set callback URL to same as above (Cognito endpoint)
4. Save Client ID and Client Secret

### 2. Deploy/Update CDK Stack

Set environment variables and deploy:

```bash
export GOOGLE_CLIENT_ID="your-id"
export GOOGLE_CLIENT_SECRET="your-secret"
export GITHUB_CLIENT_ID="your-id"
export GITHUB_CLIENT_SECRET="your-secret"

cd infra/cdk
cdk deploy MosaicLifeStack
```

### 3. Retrieve Cognito Config

```bash
./infra/scripts/setup-cognito.sh
```

This outputs values you'll need for:
- Local development (.env file)
- Production Helm values

### 4. Update Helm Values (in mosaic-life-gitops repo)

Add to `values/mosaic-life/prod/values.yaml`:

```yaml
coreApi:
  env:
    - name: ENABLE_COGNITO_AUTH
      value: "true"
    - name: COGNITO_REGION
      value: "us-east-1"
    - name: COGNITO_USER_POOL_ID
      value: "us-east-1_JLppKC09m"
    - name: APP_URL
      value: "https://mosaiclife.me"
    - name: API_URL
      value: "https://backend.mosaiclife.me"
    
  envFrom:
    - secretRef:
        name: cognito-secrets
```

### 5. Create Kubernetes Secrets

Using External Secrets Operator:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cognito-secrets
  namespace: mosaiclife
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: cognito-secrets
  data:
    - secretKey: COGNITO_CLIENT_ID
      remoteRef:
        key: mosaic/prod/cognito-config
        property: userPoolClientId
    - secretKey: COGNITO_CLIENT_SECRET
      remoteRef:
        key: mosaic/prod/cognito-client-secret
    - secretKey: SESSION_SECRET_KEY
      remoteRef:
        key: mosaic/prod/session-secret
```

---

## Local Development

### Without Cognito (Default)

```bash
cd infra/compose
cp .env.example .env
# ENABLE_COGNITO_AUTH=false (default)
docker compose up -d
```

### With Cognito (For Testing)

```bash
cd infra/compose
cp .env.example .env
```

Edit .env:
```bash
ENABLE_COGNITO_AUTH=true
COGNITO_USER_POOL_ID=us-east-1_JLppKC09m
COGNITO_CLIENT_ID=<from setup script>
COGNITO_CLIENT_SECRET=<from setup script>
COGNITO_DOMAIN=mosaic-prod-033691785857
```

Add callback URL to Cognito in AWS Console:
- `http://localhost:8080/api/auth/callback`

Then restart:
```bash
docker compose restart core-api
```

---

## Testing

### Local
1. Go to http://localhost:5173/login
2. Click "Sign In with Cognito"
3. Choose Google or GitHub
4. Should redirect to http://localhost:5173/app with session cookie set

### Production
1. Go to https://mosaiclife.me/login
2. Same flow as above
3. Verify at https://backend.mosaiclife.me/api/me

---

## Architecture Compliance

This implementation follows:
- ✅ BFF pattern (backend manages tokens, frontend gets cookies)
- ✅ OIDC Authorization Code + PKCE
- ✅ httpOnly cookies (SameSite=Lax)
- ✅ JWT verification with JWKS
- ✅ Session middleware
- ✅ CSRF protection via state parameter
- ✅ Dynamic configuration (env vars + Helm values)

Per:
- `docs/architecture/FRONTEND-ARCHITECTURE.md` §3
- `docs/architecture/CORE-BACKEND-ARCHITECTURE.md` §3
- `AGENTS.md` §5 (Auth requirements)

---

## GitHub Actions Integration

The GitHub Actions workflow should:

1. Build Docker images with latest code
2. Push to ECR
3. Update image tags in mosaic-life-gitops repo
4. ArgoCD will sync automatically

No additional changes needed for auth - configuration is via Helm values and K8s secrets.

---

## Security Checklist

Before production:
- [ ] OAuth credentials in AWS Secrets Manager
- [ ] Strong SESSION_SECRET_KEY generated (use `openssl rand -base64 32`)
- [ ] Callback URLs limited to production domains only
- [ ] External Secrets Operator configured
- [ ] SSL certificates valid
- [ ] CORS locked to same-origin

---

## Troubleshooting

**Invalid redirect URI**: Check callback URLs in Cognito User Pool match exactly (no trailing slashes)

**Token verification failed**: Verify COGNITO_USER_POOL_ID and COGNITO_REGION are correct

**Cookie not set**: Ensure APP_URL and API_URL match your environment

**CORS errors**: Backend uses same-origin policy - frontend/backend must be on same domain or use reverse proxy

---

## Next Steps

1. Complete OAuth app setup (Google + GitHub)
2. Deploy CDK with OAuth credentials
3. Run setup-cognito.sh script
4. Update Helm values in GitOps repo
5. Create K8s secrets (External Secrets)
6. Deploy via ArgoCD
7. Test authentication flow

