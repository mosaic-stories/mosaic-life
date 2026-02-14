# Staging Environment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy a staging environment that mirrors production, triggered by commits to the `develop` branch.

**Architecture:** Shared EKS cluster and ALB with namespace isolation (`mosaic-staging`). Separate PostgreSQL database on shared RDS instance. Independent S3 buckets and AWS Secrets Manager entries per environment.

**Tech Stack:** AWS CDK (TypeScript) at `infra/cdk/`, Helm, ArgoCD, PostgreSQL, AWS Secrets Manager, S3, IAM (IRSA)

---

## Phase 1: Helm Chart Changes

### Task 1: Add Session External Secret Template

Add a new Helm template to pull session secrets from AWS Secrets Manager.

**Files:**
- Create: `infra/helm/mosaic-life/templates/session-secret.yaml`

**Step 1: Create the session secret template**

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

**Step 2: Verify template syntax**

Run: `helm template test infra/helm/mosaic-life --set externalSecrets.session.secretKey=mosaic/test/session 2>&1 | head -50`
Expected: No syntax errors, session-secret ExternalSecret rendered

**Step 3: Commit**

```bash
git add infra/helm/mosaic-life/templates/session-secret.yaml
git commit -m "feat(helm): add session secret external secret template"
```

---

### Task 2: Update Helm Values with Session Secret Configuration

Add session secret path to the default values.

**Files:**
- Modify: `infra/helm/mosaic-life/values.yaml`

**Step 1: Add session secret configuration to externalSecrets block**

Find the `externalSecrets:` block (around line 322) and add the session configuration:

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

**Step 2: Verify helm template renders correctly**

Run: `helm template test infra/helm/mosaic-life 2>&1 | grep -A 10 "name: session-secret"`
Expected: ExternalSecret for session-secret with correct secretKey path

**Step 3: Commit**

```bash
git add infra/helm/mosaic-life/values.yaml
git commit -m "feat(helm): add session secret configuration to values"
```

---

## Phase 2: GitOps Repository Changes

### Task 3: Update GitOps Base Values

Add session external secret structure to the base values.

**Files:**
- Modify: `/apps/mosaic-life-gitops/base/values.yaml`

**Step 1: Add externalSecrets session structure**

Update the file to include the external secrets configuration:

```yaml
global:
  registry: 033691785857.dkr.ecr.us-east-1.amazonaws.com
  domain: mosaiclife.me
web:
  enabled: true
coreApi:
  enabled: true
externalSecrets:
  session:
    secretKey: ""  # Required override per environment
```

**Step 2: Commit to gitops repo**

```bash
cd /apps/mosaic-life-gitops
git add base/values.yaml
git commit -m "feat: add external secrets session structure to base values"
```

---

### Task 4: Update GitOps Production Values

Add session secret path to production environment.

**Files:**
- Modify: `/apps/mosaic-life-gitops/environments/prod/values.yaml`

**Step 1: Add session secret configuration**

Update the file to include:

```yaml
global:
  imageTag: 75acfe5
  environment: prod
web:
  replicaCount: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
coreApi:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
externalSecrets:
  session:
    secretKey: "mosaic/prod/session/secret-key"
```

**Step 2: Commit**

```bash
cd /apps/mosaic-life-gitops
git add environments/prod/values.yaml
git commit -m "feat(prod): add session secret path to production values"
```

---

### Task 5: Create Complete Staging Values

Create the full staging environment values file.

**Files:**
- Modify: `/apps/mosaic-life-gitops/environments/staging/values.yaml`

**Step 1: Replace staging values with complete configuration**

```yaml
# Staging Environment Configuration
# Updated automatically by GitHub Actions on merge to develop

global:
  imageTag: "develop"
  domain: "stage.mosaiclife.me"
  environment: staging

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

**Step 2: Commit**

```bash
cd /apps/mosaic-life-gitops
git add environments/staging/values.yaml
git commit -m "feat(staging): add complete staging environment configuration"
```

---

### Task 6: Push GitOps Changes

Push all gitops repository changes.

**Files:**
- None (git operations only)

**Step 1: Review changes**

```bash
cd /apps/mosaic-life-gitops
git log --oneline -5
git diff origin/main HEAD
```

**Step 2: Push to remote**

```bash
git push origin main
```

---

## Phase 3: Application CDK Infrastructure Changes

### Task 7: Update CDK Entry Point for Multi-Environment Support

Modify the CDK entry point to support deploying staging resources.

**Files:**
- Modify: `infra/cdk/bin/mosaic-life.ts`

**Step 1: Update to support staging deployment alongside production**

The current code creates stacks based on `environment` context. Update to allow deploying staging resources that share the production RDS instance:

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsCertificateStack } from '../lib/dns-certificate-stack';
import { MosaicLifeStack } from '../lib/mosaic-life-stack';
import { DatabaseStack } from '../lib/database-stack';
import { StagingResourcesStack } from '../lib/staging-resources-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '033691785857',
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Get environment from context (default to 'prod')
const environment = app.node.tryGetContext('environment') || 'prod';

// Domain configuration
const domainName = 'mosaiclife.me';
// Use existing hosted zone from MosaicDnsCertificateStack
const hostedZoneId = process.env.HOSTED_ZONE_ID || 'Z039487930F6987CJO4W9';

// Use existing VPC from MosaicLifeInfrastructureStack
const vpcId = process.env.VPC_ID || 'vpc-0cda4cc7432deca33';

// Full application stack (Cognito, S3, ECR, etc.)
const appStack = new MosaicLifeStack(app, 'MosaicLifeStack', {
  env,
  config: {
    domainName,
    hostedZoneId,
    vpcId,
    existingUserPoolId: 'us-east-1_JLppKC09m',
    existingEcrRepos: true,
    existingS3Buckets: true,
    environment,
    tags: {
      Project: 'MosaicLife',
      Environment: environment,
      ManagedBy: 'CDK',
      Component: 'Application',
    },
  },
});

// Database Stack - RDS PostgreSQL (shared across environments)
new DatabaseStack(app, 'MosaicDatabaseStack', {
  env,
  vpc: appStack.vpc,
  environment,
});

// Staging Resources Stack - S3 buckets, IAM roles, secrets for staging
// These resources use the shared RDS instance but have isolated storage/secrets
new StagingResourcesStack(app, 'MosaicStagingResourcesStack', {
  env,
  vpc: appStack.vpc,
  domainName,
});

app.synth();
```

**Step 2: Commit (after creating staging-resources-stack.ts in next task)**

---

### Task 8: Create Staging Resources Stack

Create a new CDK stack for staging-specific resources that share the production RDS.

**Files:**
- Create: `infra/cdk/lib/staging-resources-stack.ts`

**Step 1: Create the staging resources stack**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface StagingResourcesStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  domainName: string;
}

/**
 * Staging Resources Stack
 *
 * Creates staging-specific resources that complement the shared RDS instance:
 * - S3 buckets for staging media and backups
 * - IAM role for staging core-api (IRSA)
 * - Session secret for staging
 * - SNS/SQS for staging event-driven architecture
 *
 * The staging database is created manually on the shared RDS instance
 * and credentials are stored in Secrets Manager.
 */
export class StagingResourcesStack extends cdk.Stack {
  public readonly mediaBucket: s3.Bucket;
  public readonly backupBucket: s3.Bucket;
  public readonly coreApiRole: iam.Role;
  public readonly sessionSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StagingResourcesStackProps) {
    super(scope, id, props);

    const { domainName } = props;
    const environment = 'staging';

    // ============================================================
    // S3 Buckets for Staging
    // ============================================================
    this.mediaBucket = new s3.Bucket(this, 'StagingMediaBucket', {
      bucketName: `mosaic-${environment}-media-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Staging can be destroyed
      autoDeleteObjects: true, // Clean up on stack deletion
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: [
            `https://stage.${domainName}`,
            `https://stage-api.${domainName}`,
            'http://localhost:5173',
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    cdk.Tags.of(this.mediaBucket).add('Environment', environment);
    cdk.Tags.of(this.mediaBucket).add('Component', 'Storage');

    this.backupBucket = new s3.Bucket(this, 'StagingBackupBucket', {
      bucketName: `mosaic-${environment}-backups-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'ExpireOldBackups',
          enabled: true,
          expiration: cdk.Duration.days(30), // Shorter retention for staging
        },
      ],
    });

    cdk.Tags.of(this.backupBucket).add('Environment', environment);
    cdk.Tags.of(this.backupBucket).add('Component', 'Storage');

    // ============================================================
    // Session Secret for Staging
    // ============================================================
    this.sessionSecret = new secretsmanager.Secret(this, 'StagingSessionSecret', {
      secretName: `mosaic/${environment}/session/secret-key`,
      description: 'Session secret key for staging environment',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret-key',
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    cdk.Tags.of(this.sessionSecret).add('Environment', environment);
    cdk.Tags.of(this.sessionSecret).add('Component', 'Security');

    // ============================================================
    // SNS/SQS for Staging Event-Driven Architecture
    // ============================================================
    const domainEventsTopic = new sns.Topic(this, 'StagingDomainEventsTopic', {
      topicName: `mosaic-${environment}-domain-events`,
      displayName: 'Mosaic Life Staging Domain Events',
    });

    const eventsDlq = new sqs.Queue(this, 'StagingEventsDLQ', {
      queueName: `mosaic-${environment}-events-dlq`,
      retentionPeriod: cdk.Duration.days(7), // Shorter for staging
    });

    const eventsQueue = new sqs.Queue(this, 'StagingEventsQueue', {
      queueName: `mosaic-${environment}-events`,
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: eventsDlq,
        maxReceiveCount: 3,
      },
    });

    domainEventsTopic.addSubscription(
      new cdk.aws_sns_subscriptions.SqsSubscription(eventsQueue)
    );

    // ============================================================
    // IAM Role for Staging core-api (IRSA)
    // ============================================================
    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';

    this.coreApiRole = new iam.Role(this, 'StagingCoreApiRole', {
      roleName: `mosaic-${environment}-core-api-role`,
      assumedBy: new iam.WebIdentityPrincipal(
        `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`,
        {
          StringEquals: {
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:sub`]:
              `system:serviceaccount:mosaic-${environment}:core-api`,
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:aud`]: 'sts.amazonaws.com',
          },
        }
      ),
      description: 'IAM role for staging core-api service in EKS',
    });

    // Grant S3 access
    this.mediaBucket.grantReadWrite(this.coreApiRole);
    this.backupBucket.grantReadWrite(this.coreApiRole);

    // Grant Secrets Manager access for staging secrets
    this.coreApiRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowStagingSecretsAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:mosaic/staging/*`,
        ],
      })
    );

    // Grant SNS/SQS access
    domainEventsTopic.grantPublish(this.coreApiRole);
    eventsQueue.grantConsumeMessages(this.coreApiRole);

    cdk.Tags.of(this.coreApiRole).add('Environment', environment);
    cdk.Tags.of(this.coreApiRole).add('Component', 'IAM');

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'StagingMediaBucketName', {
      value: this.mediaBucket.bucketName,
      description: 'S3 bucket for staging media storage',
      exportName: `mosaic-${environment}-media-bucket`,
    });

    new cdk.CfnOutput(this, 'StagingBackupBucketName', {
      value: this.backupBucket.bucketName,
      description: 'S3 bucket for staging backups',
      exportName: `mosaic-${environment}-backup-bucket`,
    });

    new cdk.CfnOutput(this, 'StagingCoreApiRoleArn', {
      value: this.coreApiRole.roleArn,
      description: 'IRSA role ARN for staging core-api',
      exportName: `mosaic-${environment}-core-api-role-arn`,
    });

    new cdk.CfnOutput(this, 'StagingSessionSecretArn', {
      value: this.sessionSecret.secretArn,
      description: 'Session secret ARN for staging',
      exportName: `mosaic-${environment}-session-secret-arn`,
    });

    new cdk.CfnOutput(this, 'StagingDomainEventsTopicArn', {
      value: domainEventsTopic.topicArn,
      description: 'SNS topic for staging domain events',
      exportName: `mosaic-${environment}-domain-events-topic`,
    });
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /apps/mosaic-life/infra/cdk
npm run build
```

**Step 3: Commit both files**

```bash
git add lib/staging-resources-stack.ts bin/mosaic-life.ts
git commit -m "feat(cdk): add staging resources stack for S3, IAM, and secrets"
```

---

### Task 9: Create Production Session Secret

Add session secret for production environment (currently missing from CDK).

**Files:**
- Modify: `infra/cdk/lib/mosaic-life-stack.ts`

**Step 1: Add session secret after the cognitoSecret (around line 297)**

Find the `cognitoSecret` definition and add after it:

```typescript
    // Session Secret for production
    const sessionSecret = new secretsmanager.Secret(this, 'SessionSecret', {
      secretName: `mosaic/${environment}/session/secret-key`,
      description: 'Session secret key for authentication',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret-key',
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    cdk.Tags.of(sessionSecret).add('Environment', environment);
    cdk.Tags.of(sessionSecret).add('Component', 'Security');
```

**Step 2: Commit**

```bash
git add lib/mosaic-life-stack.ts
git commit -m "feat(cdk): add session secret for production environment"
```

---

### Task 10: Preview CDK Changes

Review what will be deployed before applying.

**Files:**
- None (CDK operations only)

**Step 1: Synthesize and diff**

```bash
cd /apps/mosaic-life/infra/cdk
npm run build
npx cdk diff MosaicLifeStack
npx cdk diff MosaicStagingResourcesStack
```

**Step 2: Review the changes**

Expected output should show:
- New session secret for MosaicLifeStack
- New S3 buckets for staging
- New IAM role for staging core-api
- New session secret for staging
- New SNS/SQS for staging

---

### Task 11: Deploy CDK Infrastructure

Deploy the staging infrastructure to AWS.

**Files:**
- None (CDK deployment)

**Step 1: Deploy MosaicLifeStack first (adds production session secret)**

```bash
cd /apps/mosaic-life/infra/cdk
npx cdk deploy MosaicLifeStack --require-approval never
```

**Step 2: Deploy MosaicStagingResourcesStack**

```bash
npx cdk deploy MosaicStagingResourcesStack --require-approval never
```

**Step 3: Verify resources were created**

```bash
aws s3 ls | grep mosaic-staging
aws iam get-role --role-name mosaic-staging-core-api-role --query 'Role.Arn'
aws secretsmanager describe-secret --secret-id "mosaic/staging/session/secret-key"
aws secretsmanager describe-secret --secret-id "mosaic/prod/session/secret-key"
```

**Step 4: Commit CDK outputs**

```bash
git add cdk.out/ cdk.context.json
git commit -m "chore(cdk): update cdk outputs after staging deployment"
```

---

## Phase 4: Database Setup

### Task 12: Create Staging Database Credentials Secret

Create the RDS credentials secret for staging (points to shared RDS, separate database).

**Files:**
- None (AWS CLI operation)

**Step 1: Get existing RDS endpoint**

```bash
aws rds describe-db-instances \
  --query "DBInstances[?DBInstanceIdentifier=='mosaic-prod-db'].Endpoint.Address" \
  --output text
```

**Step 2: Generate secure password for staging user**

```bash
openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32
```

**Step 3: Create secret via AWS CLI**

Replace `<RDS_ENDPOINT>` and `<GENERATED_PASSWORD>` with actual values:

```bash
aws secretsmanager create-secret \
  --name "mosaic/staging/rds/credentials" \
  --description "Database credentials for staging environment (uses shared RDS instance)" \
  --secret-string '{
    "host": "<RDS_ENDPOINT>",
    "port": "5432",
    "username": "mosaic_staging",
    "password": "<GENERATED_PASSWORD>",
    "dbname": "core_staging"
  }' \
  --tags Key=Environment,Value=staging Key=Component,Value=Database
```

**Step 4: Verify secret was created**

```bash
aws secretsmanager describe-secret --secret-id "mosaic/staging/rds/credentials"
```

---

### Task 13: Create Staging Database and User

Connect to RDS and create the staging database and user.

**Files:**
- None (Database operation)

**Step 1: Get production RDS master credentials**

```bash
aws secretsmanager get-secret-value \
  --secret-id "mosaic/prod/rds/credentials" \
  --query 'SecretString' --output text | jq .
```

**Step 2: Connect to RDS via kubectl port-forward**

```bash
# Start a PostgreSQL client pod
kubectl run psql-client --rm -it --image=postgres:16 --restart=Never -- bash

# Inside the pod, connect to RDS
psql -h <RDS_ENDPOINT> -U mosaicadmin -d postgres
# Enter the master password when prompted
```

**Step 3: Create staging database and user**

```sql
-- Create the staging database
CREATE DATABASE core_staging;

-- Create the staging user with the password from Task 12
CREATE USER mosaic_staging WITH ENCRYPTED PASSWORD '<PASSWORD_FROM_TASK_12>';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE core_staging TO mosaic_staging;

-- Connect to the staging database and set up schema permissions
\c core_staging
GRANT ALL ON SCHEMA public TO mosaic_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mosaic_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mosaic_staging;

-- Verify
\du mosaic_staging
\l core_staging
```

**Step 4: Exit and clean up**

```sql
\q
```

```bash
exit
```

---

## Phase 5: External Configuration

### Task 14: Update Google OAuth Redirect URIs

Add staging redirect URIs to the Google OAuth application.

**Files:**
- None (Google Cloud Console operation)

**Step 1: Navigate to Google Cloud Console**

Go to: https://console.cloud.google.com/apis/credentials

**Step 2: Edit the OAuth 2.0 Client**

Find the Mosaic Life OAuth client and add these authorized redirect URIs:

- `https://stage.mosaiclife.me/auth/callback`
- `https://stage-api.mosaiclife.me/auth/callback`

**Step 3: Save changes**

Click "Save" to update the OAuth client configuration.

---

## Phase 6: Deployment and Verification

### Task 15: Push Application Repository Changes

Push the Helm chart and CDK changes to main.

**Files:**
- None (git operations only)

**Step 1: Ensure all changes are committed**

```bash
cd /apps/mosaic-life
git status
git log --oneline -10
```

**Step 2: Push to main**

```bash
git push origin main
```

**Step 3: Monitor ArgoCD sync for production**

```bash
argocd app get mosaic-life-prod --refresh
argocd app wait mosaic-life-prod --sync
```

---

### Task 16: Verify ArgoCD Staging Application

Ensure ArgoCD staging application syncs correctly.

**Files:**
- None (verification only)

**Step 1: Check staging application status**

```bash
argocd app get mosaic-life-staging --refresh
```

**Step 2: Sync if needed**

```bash
argocd app sync mosaic-life-staging
argocd app wait mosaic-life-staging --sync
```

**Step 3: Check pod status**

```bash
kubectl get pods -n mosaic-staging
kubectl get ingress -n mosaic-staging
```

**Step 4: Check external secrets**

```bash
kubectl get externalsecrets -n mosaic-staging
kubectl get secrets -n mosaic-staging
```

---

### Task 17: Run Staging Database Migrations

Verify migrations run against the staging database.

**Files:**
- None (operations only)

**Step 1: Check migration job status**

```bash
kubectl get jobs -n mosaic-staging
kubectl logs -n mosaic-staging -l job-name=core-api-migration --tail=100
```

**Step 2: If migration job failed or hasn't run, trigger manually**

```bash
# Delete completed/failed job to allow re-run
kubectl delete job core-api-migration -n mosaic-staging --ignore-not-found

# Force ArgoCD to recreate the job
argocd app sync mosaic-life-staging --resource apps/Job/core-api-migration
```

**Step 3: Verify migrations completed**

```bash
kubectl logs -n mosaic-staging -l job-name=core-api-migration --tail=50
```

Expected: "INFO  [alembic.runtime.migration] Running upgrade ... -> head"

---

### Task 18: Verify Staging Environment

End-to-end verification of the staging environment.

**Files:**
- None (verification only)

**Step 1: Check DNS resolution**

```bash
dig stage.mosaiclife.me +short
dig stage-api.mosaiclife.me +short
```

Expected: Both resolve to ALB DNS name

**Step 2: Test web application**

```bash
curl -I https://stage.mosaiclife.me
```

Expected: HTTP 200 response

**Step 3: Test API health endpoint**

```bash
curl https://stage-api.mosaiclife.me/healthz
curl https://stage-api.mosaiclife.me/readyz
```

Expected: Both return healthy status

**Step 4: Test Google OAuth flow (manual)**

Open browser to: `https://stage.mosaiclife.me`
Click "Sign in with Google"
Expected: Redirects to Google OAuth, then back to staging app

**Step 5: Verify S3 bucket access from pod**

```bash
kubectl exec -it -n mosaic-staging deployment/core-api -- \
  aws s3 ls s3://mosaic-staging-media-033691785857/
```

Expected: No errors (empty bucket is fine)

---

### Task 19: Test CI/CD Pipeline with Develop Branch

Create and push to develop branch to test the full pipeline.

**Files:**
- None (git operations only)

**Step 1: Create develop branch if it doesn't exist**

```bash
cd /apps/mosaic-life
git fetch origin
git checkout -b develop origin/main 2>/dev/null || git checkout develop
git push -u origin develop
```

**Step 2: Make a trivial change and push**

```bash
echo "" >> README.md
git add README.md
git commit -m "test: verify develop branch CI/CD pipeline"
git push origin develop
```

**Step 3: Monitor GitHub Actions**

```bash
gh run list --branch develop --limit 5
gh run watch
```

**Step 4: Verify GitOps repo was updated**

```bash
cd /apps/mosaic-life-gitops
git pull origin main
cat environments/staging/values.yaml | grep imageTag
```

Expected: imageTag updated to new commit SHA

**Step 5: Verify ArgoCD synced new image**

```bash
argocd app get mosaic-life-staging | grep -A5 "Images:"
kubectl get pods -n mosaic-staging -o jsonpath='{.items[*].spec.containers[*].image}'
```

---

## Summary Checklist

After completing all tasks:

**Helm Chart Changes:**
- [ ] Session secret ExternalSecret template created
- [ ] Helm values updated with session secret config

**GitOps Repository:**
- [ ] Base values include externalSecrets structure
- [ ] Prod values include session secret path
- [ ] Staging values fully configured
- [ ] Changes pushed to main

**Application CDK (`infra/cdk/`):**
- [ ] staging-resources-stack.ts created
- [ ] bin/mosaic-life.ts updated to include staging stack
- [ ] Production session secret added to mosaic-life-stack.ts
- [ ] CDK deployed successfully

**AWS Resources:**
- [ ] Staging S3 media bucket exists
- [ ] Staging S3 backup bucket exists
- [ ] Staging IAM role (IRSA) exists
- [ ] Staging session secret exists
- [ ] Production session secret exists
- [ ] Staging RDS credentials secret exists
- [ ] Staging database created on shared RDS
- [ ] Staging database user created

**External Configuration:**
- [ ] Google OAuth redirect URIs updated

**Kubernetes:**
- [ ] ArgoCD staging app syncs successfully
- [ ] Staging pods running
- [ ] External secrets synced
- [ ] Database migrations completed

**Verification:**
- [ ] DNS resolves for stage.mosaiclife.me
- [ ] DNS resolves for stage-api.mosaiclife.me
- [ ] Web app accessible at staging URL
- [ ] API health checks pass
- [ ] Develop branch CI/CD triggers staging deployment
