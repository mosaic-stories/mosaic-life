# Staging Environment Design

## Overview

This document describes the design for adding a staging environment to Mosaic Life. The staging environment provides a pre-production environment for testing changes before they reach production.

## Branch-to-Environment Mapping

| Branch    | Environment | Namespace       | Web URL                  | API URL                      |
|-----------|-------------|-----------------|--------------------------|------------------------------|
| `main`    | Production  | `mosaic-prod`   | `mosaiclife.me`          | `api.mosaiclife.me`          |
| `develop` | Staging     | `mosaic-staging`| `stage.mosaiclife.me`    | `stage-api.mosaiclife.me`    |

## Architecture Decisions

### Shared Infrastructure

| Resource              | Approach                                      | Rationale                                                    |
|-----------------------|-----------------------------------------------|--------------------------------------------------------------|
| EKS Cluster           | Shared, separate namespaces                   | Cost efficiency, sufficient isolation via namespaces         |
| ALB                   | Shared (`mosaic-life-main` group)             | Cost savings (~$22/month); can separate later if needed      |
| ACM Certificate       | Shared wildcard (`*.mosaiclife.me`)           | Already covers staging subdomains                            |
| RDS Instance          | Shared instance, separate databases           | Cost efficiency; complete data isolation at database level   |
| Google OAuth          | Single app, multiple redirect URIs            | Simpler secrets management; standard multi-env practice      |

### Isolated Per Environment

| Resource              | Production                                    | Staging                                                      |
|-----------------------|-----------------------------------------------|--------------------------------------------------------------|
| Kubernetes Namespace  | `mosaic-prod`                                 | `mosaic-staging`                                             |
| PostgreSQL Database   | `core_prod`                                   | `core_staging`                                               |
| S3 Media Bucket       | `mosaic-prod-media-033691785857`              | `mosaic-staging-media-033691785857`                          |
| S3 Backup Bucket      | `mosaic-prod-backups-033691785857`            | `mosaic-staging-backups-033691785857`                        |
| Session Secret        | `mosaic/prod/session/secret-key`              | `mosaic/staging/session/secret-key`                          |
| DB Credentials        | `mosaic/prod/rds/credentials`                 | `mosaic/staging/rds/credentials`                             |
| IAM Role (IRSA)       | `mosaic-prod-core-api-role`                   | `mosaic-staging-core-api-role`                               |

### Resource Sizing

Staging uses minimal fixed replicas (no autoscaling) to reduce costs:

| Component | Production          | Staging            |
|-----------|---------------------|--------------------|
| Web       | 2 replicas, HPA 2-10| 1 replica, no HPA  |
| Core API  | 3 replicas, HPA 3-20| 1 replica, no HPA  |

Resource limits remain the same as production for accurate testing.

### Cookie Domain

Both environments use `SESSION_COOKIE_DOMAIN=.mosaiclife.me`. This is necessary because `stage.mosaiclife.me` and `stage-api.mosaiclife.me` are sibling subdomains, not parent-child.

Cross-environment session leakage is prevented by using different session secret keys per environment - cookies from one environment will fail signature validation in the other.

## Implementation

### AWS Resources

#### 1. RDS Database

Create staging database on existing RDS instance:

```sql
CREATE DATABASE core_staging;
CREATE USER mosaic_staging WITH ENCRYPTED PASSWORD '<generate-secure-password>';
GRANT ALL PRIVILEGES ON DATABASE core_staging TO mosaic_staging;
```

#### 2. S3 Buckets

Create staging buckets:

- `mosaic-staging-media-033691785857`
- `mosaic-staging-backups-033691785857`

Configure with appropriate lifecycle policies and block public access.

#### 3. AWS Secrets Manager

Create staging secrets:

**`mosaic/staging/rds/credentials`**:
```json
{
  "host": "<rds-endpoint>",
  "port": "5432",
  "username": "mosaic_staging",
  "password": "<password>",
  "dbname": "core_staging"
}
```

**`mosaic/staging/session/secret-key`**:
```json
{
  "secret-key": "<generate-256-bit-random-key>"
}
```

Also create production session secret (if not already externalized):

**`mosaic/prod/session/secret-key`**:
```json
{
  "secret-key": "<existing-or-new-production-key>"
}
```

#### 4. IAM Role

Create `mosaic-staging-core-api-role` with:

**Trust Policy** (IRSA for mosaic-staging namespace):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::033691785857:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/<OIDC_ID>"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-east-1.amazonaws.com/id/<OIDC_ID>:sub": "system:serviceaccount:mosaic-staging:core-api"
        }
      }
    }
  ]
}
```

**Permissions Policy**:
- S3 access to staging buckets
- Secrets Manager access to staging secrets

#### 5. Google OAuth

Add redirect URIs to existing Google OAuth app:

- `https://stage.mosaiclife.me/auth/callback`
- `https://stage-api.mosaiclife.me/auth/callback` (if API handles OAuth)

### Application Repository Changes

#### New File: `infra/helm/mosaic-life/templates/session-secret.yaml`

```yaml
{{- if .Values.externalSecrets.enabled }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: session-secret
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "mosaic-life.labels" . | nindent 4 }}
spec:
  refreshInterval: {{ .Values.externalSecrets.refreshInterval | default "1h" }}
  secretStoreRef:
    name: {{ .Values.externalSecrets.secretStoreRef.name }}
    kind: {{ .Values.externalSecrets.secretStoreRef.kind }}
  target:
    name: session-secret
    creationPolicy: Owner
  data:
    - secretKey: secret-key
      remoteRef:
        key: {{ .Values.externalSecrets.session.secretKey }}
        property: secret-key
{{- end }}
```

#### Update: `infra/helm/mosaic-life/values.yaml`

Add session secret configuration:

```yaml
externalSecrets:
  enabled: true
  refreshInterval: "1h"
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  database:
    secretKey: "mosaic/prod/rds/credentials"
  session:
    secretKey: "mosaic/prod/session/secret-key"
```

### GitOps Repository Changes

#### Update: `base/values.yaml`

Add session external secret structure:

```yaml
externalSecrets:
  session:
    secretKey: ""  # Required override per environment
```

#### Update: `environments/prod/values.yaml`

Add session secret path:

```yaml
externalSecrets:
  session:
    secretKey: "mosaic/prod/session/secret-key"
```

#### Create/Update: `environments/staging/values.yaml`

```yaml
global:
  imageTag: "develop"
  domain: "stage.mosaiclife.me"
  environment: "staging"

web:
  replicaCount: 1
  autoscaling:
    enabled: false
  podDisruptionBudget:
    enabled: false
  ingress:
    annotations:
      alb.ingress.kubernetes.io/tags: "Environment=staging,Project=MosaicLife,Component=web"
      external-dns.alpha.kubernetes.io/hostname: "stage.mosaiclife.me"
    hosts:
      - host: stage.mosaiclife.me
        paths:
          - path: /
            pathType: Prefix

coreApi:
  replicaCount: 1
  autoscaling:
    enabled: false
  podDisruptionBudget:
    enabled: false
  serviceAccount:
    annotations:
      eks.amazonaws.com/role-arn: arn:aws:iam::033691785857:role/mosaic-staging-core-api-role
  ingress:
    annotations:
      alb.ingress.kubernetes.io/tags: "Environment=staging,Project=MosaicLife,Component=backend"
      external-dns.alpha.kubernetes.io/hostname: "stage-api.mosaiclife.me"
    hosts:
      - host: stage-api.mosaiclife.me
        paths:
          - path: /
            pathType: Prefix
  env:
    - name: PORT
      value: "8080"
    - name: ENVIRONMENT
      value: "staging"
    - name: LOG_LEVEL
      value: "info"
    - name: AWS_REGION
      value: "us-east-1"
    - name: GOOGLE_CLIENT_ID
      valueFrom:
        secretKeyRef:
          name: google-oauth
          key: client-id
    - name: GOOGLE_CLIENT_SECRET
      valueFrom:
        secretKeyRef:
          name: google-oauth
          key: client-secret
    - name: APP_URL
      value: "https://stage.mosaiclife.me"
    - name: API_URL
      value: "https://stage-api.mosaiclife.me"
    - name: SESSION_SECRET_KEY
      valueFrom:
        secretKeyRef:
          name: session-secret
          key: secret-key
    - name: SESSION_COOKIE_DOMAIN
      value: ".mosaiclife.me"
    - name: STORAGE_BACKEND
      value: "s3"
    - name: S3_MEDIA_BUCKET
      value: "mosaic-staging-media-033691785857"
    - name: S3_BACKUP_BUCKET
      value: "mosaic-staging-backups-033691785857"
    - name: DB_URL
      valueFrom:
        secretKeyRef:
          name: database-credentials
          key: DB_URL

externalSecrets:
  database:
    secretKey: "mosaic/staging/rds/credentials"
  session:
    secretKey: "mosaic/staging/session/secret-key"
```

## No Changes Required

The following components already support staging without modification:

- **GitHub Actions workflow** (`build-push.yml`): Already handles `develop` → staging mapping
- **ArgoCD applications**: `mosaic-life-staging.yaml` already configured correctly
- **ACM certificate**: Wildcard `*.mosaiclife.me` covers staging domains
- **Helm chart templates**: Already parameterized for environment-specific values

## Future Considerations

### Separate ALB for Staging

If staging needs to be fully shut down during idle periods, consider:

1. Change staging to use `alb.ingress.kubernetes.io/group.name: mosaic-life-staging`
2. Scaling staging to 0 replicas will allow the ALB to be cleaned up
3. Trade-off: Additional ~$22/month when staging is running

### Database Migration Strategy

Staging database migrations should run automatically via the existing migration job. Ensure the migration job uses the correct database credentials from the namespace-specific secrets.

## Deployment Order

1. Create AWS resources (RDS database, S3 buckets, Secrets Manager entries, IAM role)
2. Update Google OAuth redirect URIs
3. Commit Helm chart changes to `main` branch
4. Commit GitOps repository changes
5. ArgoCD will automatically sync staging environment
6. Verify staging environment at `stage.mosaiclife.me`
