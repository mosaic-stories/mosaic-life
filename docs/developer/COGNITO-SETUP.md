# AWS Cognito Setup Guide

This guide explains how to configure AWS Cognito authentication for Mosaic Life, including social login providers (Google, GitHub).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Configure Social Login Providers](#configure-social-login-providers)
4. [Deploy Cognito Infrastructure](#deploy-cognito-infrastructure)
5. [Local Development Setup](#local-development-setup)
6. [Production Helm Values](#production-helm-values)
7. [Testing Authentication](#testing-authentication)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Mosaic Life uses AWS Cognito for authentication with the following architecture:

- **Pattern**: Backend-for-Frontend (BFF) with OIDC
- **Flow**: Authorization Code + PKCE
- **Session**: httpOnly cookies (SameSite=Lax)
- **Providers**: Cognito User Pool + Google + GitHub (extensible)

The implementation follows the architecture defined in:
- `docs/architecture/FRONTEND-ARCHITECTURE.md` §3
- `docs/architecture/CORE-BACKEND-ARCHITECTURE.md` §3

---

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20+ and pnpm (for CDK)
- Access to Mosaic Life AWS account
- Domain name configured (mosaiclife.me)

---

## Configure Social Login Providers

### Google OAuth App

1. **Go to Google Cloud Console**:
   - Navigate to: https://console.cloud.google.com/
   - Select or create a project

2. **Enable Google+ API**:
   - APIs & Services → Library
   - Search for "Google+ API" and enable it

3. **Create OAuth 2.0 Credentials**:
   - APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: `Mosaic Life Production`

4. **Configure Authorized Redirect URIs**:
   Add the following URIs (replace `DOMAIN` and `ACCOUNT_ID` with actual values):
   ```
   https://mosaic-prod-ACCOUNT_ID.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
   ```

   For development/staging, also add:
   ```
   https://mosaic-dev-ACCOUNT_ID.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
   ```

5. **Save Client ID and Secret**:
   - Copy the **Client ID** and **Client secret**
   - Store these securely (you'll need them for CDK deployment)

### GitHub OAuth App

1. **Go to GitHub Settings**:
   - Navigate to: https://github.com/settings/developers
   - Click "OAuth Apps" → "New OAuth App"

2. **Configure Application**:
   - Application name: `Mosaic Life`
   - Homepage URL: `https://mosaiclife.me`
   - Authorization callback URL:
     ```
     https://mosaic-prod-ACCOUNT_ID.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
     ```

3. **Generate Client Secret**:
   - After creating the app, click "Generate a new client secret"
   - Save the **Client ID** and **Client secret**

---

## Deploy Cognito Infrastructure

### 1. Set Environment Variables

Export the OAuth credentials before deploying CDK:

```bash
export GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
export GITHUB_CLIENT_ID="your-github-client-id"
export GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### 2. Deploy CDK Stack

```bash
cd infra/cdk

# Install dependencies
npm install

# Deploy the stack
cdk deploy MosaicLifeStack \
  --context environment=prod \
  --require-approval never
```

### 3. Retrieve Cognito Configuration

After deployment, get the Cognito configuration:

```bash
# Run the helper script
./infra/scripts/setup-cognito.sh

# Or manually retrieve from AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id mosaic/prod/cognito-config \
  --region us-east-1 \
  --query SecretString \
  --output text | jq .
```

The output will include:
- `userPoolId`
- `userPoolClientId`
- `userPoolDomain`
- `region`

---

## Local Development Setup

### Option 1: Stub Authentication (Default)

For local development without Cognito:

```bash
cd infra/compose

# Copy environment template
cp .env.example .env

# Ensure Cognito auth is disabled
echo "ENABLE_COGNITO_AUTH=false" >> .env

# Start services
docker compose up -d
```

### Option 2: Real Cognito (For Testing)

To test with actual Cognito locally:

1. **Configure environment**:
   ```bash
   cd infra/compose
   cp .env.example .env
   ```

2. **Update .env with Cognito values**:
   ```bash
   ENABLE_COGNITO_AUTH=true
   COGNITO_REGION=us-east-1
   COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
   COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxx
   COGNITO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   COGNITO_DOMAIN=mosaic-prod-XXXXXXXXXXXX
   APP_URL=http://localhost:5173
   API_URL=http://localhost:8080
   ```

3. **Add local callback URL to Cognito**:
   - Go to AWS Console → Cognito → User Pools
   - Select your user pool → App Integration → App clients
   - Edit the app client
   - Add callback URL: `http://localhost:8080/api/auth/callback`
   - Add logout URL: `http://localhost:5173`

4. **Generate session secret**:
   ```bash
   openssl rand -base64 32
   ```
   Add this to `.env` as `SESSION_SECRET_KEY`

5. **Restart services**:
   ```bash
   docker compose restart core-api
   ```

---

## Production Helm Values

### Location

Helm values are managed in the GitOps repository:
```
../mosaic-life-gitops/values/mosaic-life/prod/values.yaml
```

### Required Configuration

Add the following to your Helm values:

```yaml
coreApi:
  env:
    # ... existing env vars ...
    
    # Cognito Configuration
    - name: ENABLE_COGNITO_AUTH
      value: "true"
    - name: COGNITO_REGION
      value: "us-east-1"
    - name: COGNITO_USER_POOL_ID
      value: "us-east-1_JLppKC09m"  # From CDK output
    - name: APP_URL
      value: "https://mosaiclife.me"
    - name: API_URL
      value: "https://backend.mosaiclife.me"
    
  # Sensitive values from Kubernetes secrets
  envFrom:
    - secretRef:
        name: cognito-config  # Contains COGNITO_CLIENT_ID and COGNITO_CLIENT_SECRET
    - secretRef:
        name: session-config  # Contains SESSION_SECRET_KEY
```

### Create Kubernetes Secrets

Use External Secrets Operator or create manually:

```bash
# Option 1: Using External Secrets (Recommended)
# Create ExternalSecret resource that pulls from AWS Secrets Manager
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cognito-config
  namespace: mosaiclife
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: cognito-config
  data:
    - secretKey: COGNITO_CLIENT_ID
      remoteRef:
        key: mosaic/prod/cognito-config
        property: userPoolClientId
    - secretKey: COGNITO_CLIENT_SECRET
      remoteRef:
        key: mosaic/prod/cognito-config
        property: clientSecret
