# Neptune Graph Database Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AWS Neptune as a dedicated graph database for social networks and story-extracted entity connections, with CDK infrastructure, Secrets Manager integration, and local development via TinkerPop.

**Architecture:** A new CDK stack (`NeptuneDatabaseStack`) creates a Neptune cluster (db.t4g.medium, openCypher, IAM auth) in private subnets. Connection metadata is stored in Secrets Manager and exposed to Kubernetes via External Secrets. Locally, a TinkerPop Gremlin Server container in Docker Compose provides a compatible development environment.

**Tech Stack:** AWS CDK (`@aws-cdk/aws-neptune-alpha`), Neptune (openCypher), Secrets Manager, IRSA, External Secrets Operator, TinkerPop Gremlin Server (Docker), Helm

**Design doc:** `docs/plans/2026-02-26-neptune-graph-database-design.md`

---

### Task 1: Add Neptune CDK dependency

**Files:**
- Modify: `infra/cdk/package.json`

**Step 1: Install the Neptune alpha CDK package**

```bash
cd /apps/mosaic-life/infra/cdk && npm install @aws-cdk/aws-neptune-alpha
```

**Step 2: Verify the package was added**

Run: `grep neptune /apps/mosaic-life/infra/cdk/package.json`
Expected: `"@aws-cdk/aws-neptune-alpha": "^2.x.x"` appears in dependencies

**Step 3: Verify TypeScript compilation**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add infra/cdk/package.json infra/cdk/package-lock.json
git commit -m "chore: add @aws-cdk/aws-neptune-alpha dependency"
```

---

### Task 2: Create the Neptune CDK stack

**Files:**
- Create: `infra/cdk/lib/neptune-database-stack.ts`

**Step 1: Write the Neptune stack**

Create `infra/cdk/lib/neptune-database-stack.ts` with the following content:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as neptune from '@aws-cdk/aws-neptune-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface NeptuneDatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  environment: string;
}

/**
 * Neptune Graph Database Stack
 *
 * Dedicated graph database for social network relationships
 * and story-extracted entity connections (places, objects, events).
 *
 * Configuration:
 * - db.t4g.medium writer (2 vCPU, 4 GB RAM) - ~$70/month
 * - Single writer, no readers (add readers later for scaling)
 * - IAM authentication (SigV4 signing, no username/password)
 * - openCypher query language
 * - Encrypted at rest
 * - 7-day automated backups
 */
export class NeptuneDatabaseStack extends cdk.Stack {
  public readonly dbCluster: neptune.DatabaseCluster;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly connectionSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: NeptuneDatabaseStackProps) {
    super(scope, id, props);

    const { vpc, environment } = props;

    // ============================================================
    // Security Group for Neptune
    // ============================================================
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'NeptuneSecurityGroup', {
      vpc,
      securityGroupName: `mosaic-${environment}-neptune-sg`,
      description: 'Security group for Neptune graph database cluster',
      allowAllOutbound: false,
    });

    const vpcCidr = vpc.vpcCidrBlock || '10.0.0.0/16';
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(8182),
      'Allow Neptune traffic from VPC'
    );

    // ============================================================
    // Cluster Parameter Group
    // ============================================================
    const clusterParameterGroup = new neptune.ClusterParameterGroup(this, 'NeptuneClusterParameterGroup', {
      description: 'Cluster parameter group for Mosaic Life Neptune',
      parameters: {
        neptune_enable_audit_log: '1',
        neptune_enforce_ssl: 'true',
      },
    });

    // ============================================================
    // Instance Parameter Group
    // ============================================================
    const parameterGroup = new neptune.ParameterGroup(this, 'NeptuneParameterGroup', {
      description: 'Instance parameter group for Mosaic Life Neptune',
      parameters: {
        neptune_query_timeout: '120000',
      },
    });

    // ============================================================
    // Neptune Database Cluster
    // ============================================================
    this.dbCluster = new neptune.DatabaseCluster(this, 'NeptuneCluster', {
      dbClusterName: `mosaic-${environment}-neptune`,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.dbSecurityGroup],

      // Single writer instance
      instanceType: neptune.InstanceType.T4G_MEDIUM,
      instances: 1,

      // Parameter groups
      clusterParameterGroup,
      parameterGroup,

      // IAM authentication
      iamAuthentication: true,

      // Encryption at rest
      storageEncrypted: true,

      // Backup configuration
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '03:00-04:00',
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',

      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,

      // Deletion protection
      deletionProtection: environment === 'prod',
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,

      // CloudWatch log exports
      cloudwatchLogsExports: [neptune.LogType.AUDIT],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
    });

    // ============================================================
    // Connection Secret (Secrets Manager)
    // ============================================================
    this.connectionSecret = new secretsmanager.Secret(this, 'NeptuneConnectionSecret', {
      secretName: `mosaic/${environment}/neptune/connection`,
      description: 'Neptune graph database connection metadata',
      secretObjectValue: {
        host: cdk.SecretValue.unsafePlainText(this.dbCluster.clusterEndpoint.hostname),
        port: cdk.SecretValue.unsafePlainText('8182'),
        engine: cdk.SecretValue.unsafePlainText('neptune'),
        iam_auth: cdk.SecretValue.unsafePlainText('true'),
        region: cdk.SecretValue.unsafePlainText(this.region),
      },
    });

    // ============================================================
    // IRSA Role for Neptune Access
    // ============================================================
    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';

    const neptuneAccessRole = new iam.Role(this, 'NeptuneAccessRole', {
      roleName: `mosaic-${environment}-neptune-access-role`,
      description: 'IAM role for core-api to access Neptune and connection secret via IRSA',
      assumedBy: new iam.FederatedPrincipal(
        `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`,
        {
          StringEquals: {
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:sub`]:
              `system:serviceaccount:mosaic-${environment}:core-api-secrets-sa`,
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:aud`]:
              'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Grant read access to connection secret
    this.connectionSecret.grantRead(neptuneAccessRole);

    // Grant Neptune IAM DB connect access
    neptuneAccessRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['neptune-db:connect'],
      resources: [
        `arn:aws:neptune-db:${this.region}:${this.account}:${this.dbCluster.clusterResourceIdentifier}/*`,
      ],
    }));

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'NeptuneClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Neptune cluster writer endpoint',
      exportName: `mosaic-${environment}-neptune-endpoint`,
    });

    new cdk.CfnOutput(this, 'NeptuneClusterPort', {
      value: '8182',
      description: 'Neptune cluster port',
      exportName: `mosaic-${environment}-neptune-port`,
    });

    new cdk.CfnOutput(this, 'NeptuneClusterIdentifier', {
      value: `mosaic-${environment}-neptune`,
      description: 'Neptune cluster identifier',
      exportName: `mosaic-${environment}-neptune-cluster-id`,
    });

    new cdk.CfnOutput(this, 'NeptuneSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      description: 'Security group ID for Neptune cluster',
      exportName: `mosaic-${environment}-neptune-sg-id`,
    });

    new cdk.CfnOutput(this, 'NeptuneConnectionSecretArn', {
      value: this.connectionSecret.secretArn,
      description: 'ARN of Neptune connection secret',
      exportName: `mosaic-${environment}-neptune-secret-arn`,
    });

    new cdk.CfnOutput(this, 'NeptuneAccessRoleArn', {
      value: neptuneAccessRole.roleArn,
      description: 'IAM role ARN for Neptune access',
      exportName: `mosaic-${environment}-neptune-access-role-arn`,
    });

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: 'db.t4g.medium: ~$70/month + storage/IO: ~$6-11/month = ~$76-81/month total',
      description: 'Estimated monthly cost for Neptune configuration',
    });
  }
}
```

**Step 2: Verify TypeScript compilation**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add infra/cdk/lib/neptune-database-stack.ts
git commit -m "feat: add Neptune graph database CDK stack"
```

---

### Task 3: Register Neptune stack in CDK app

**Files:**
- Modify: `infra/cdk/bin/mosaic-life.ts`

**Step 1: Add the import and stack instantiation**

Add import at the top of the file (after the existing imports):

```typescript
import { NeptuneDatabaseStack } from '../lib/neptune-database-stack';
```

Add the Neptune stack instantiation after the Aurora block (around line 67), before the Staging Resources Stack:

```typescript
// Neptune Graph Database Stack - dedicated graph DB for social networks and entity connections
new NeptuneDatabaseStack(app, 'MosaicNeptuneDatabaseStack', {
  env,
  vpc: appStack.vpc,
  environment: prodEnvironment,
});
```

**Step 2: Verify CDK synth works**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth MosaicNeptuneDatabaseStack --quiet 2>&1 | head -5`
Expected: CloudFormation template output (or at minimum, no TypeScript errors)

**Step 3: Commit**

```bash
git add infra/cdk/bin/mosaic-life.ts
git commit -m "feat: register Neptune stack in CDK app"
```

---

### Task 4: Add Neptune External Secret to Helm chart

**Files:**
- Modify: `infra/helm/mosaic-life/templates/external-secrets.yaml`
- Modify: `infra/helm/mosaic-life/values.yaml`

**Step 1: Add Neptune ExternalSecret resource**

Append the following to `infra/helm/mosaic-life/templates/external-secrets.yaml`, just before the final `{{- end }}` (the one that closes `{{- if .Values.externalSecrets.enabled }}`):

```yaml
{{- if .Values.externalSecrets.neptune.secretKey }}
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: neptune-connection
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "mosaic-life.labels" . | nindent 4 }}
  annotations:
    helm.sh/hook: pre-install,pre-upgrade
    helm.sh/hook-weight: "4"
    helm.sh/hook-delete-policy: before-hook-creation
spec:
  refreshInterval: {{ .Values.externalSecrets.refreshInterval | default "1h" }}
  secretStoreRef:
    name: {{ .Values.externalSecrets.secretStoreRef.name }}
    kind: {{ .Values.externalSecrets.secretStoreRef.kind }}
  target:
    name: neptune-connection
    creationPolicy: Owner
  data:
    - secretKey: host
      remoteRef:
        key: {{ .Values.externalSecrets.neptune.secretKey }}
        property: host
    - secretKey: port
      remoteRef:
        key: {{ .Values.externalSecrets.neptune.secretKey }}
        property: port
    - secretKey: region
      remoteRef:
        key: {{ .Values.externalSecrets.neptune.secretKey }}
        property: region
    - secretKey: iam_auth
      remoteRef:
        key: {{ .Values.externalSecrets.neptune.secretKey }}
        property: iam_auth
{{- end }}
```

**Step 2: Add Neptune values configuration**

Add the following under the `externalSecrets` section in `infra/helm/mosaic-life/values.yaml` (after the `debugSse` block, around line 361):

```yaml
  neptune:
    secretKey: "mosaic/prod/neptune/connection"
```

**Step 3: Add Neptune environment variables to core-api**

Add the following env vars to the `coreApi.env` list in `infra/helm/mosaic-life/values.yaml` (after the `DB_URL` block, around line 223):

```yaml
    # Neptune Graph Database
    - name: NEPTUNE_HOST
      valueFrom:
        secretKeyRef:
          name: neptune-connection
          key: host
    - name: NEPTUNE_PORT
      valueFrom:
        secretKeyRef:
          name: neptune-connection
          key: port
    - name: NEPTUNE_REGION
      valueFrom:
        secretKeyRef:
          name: neptune-connection
          key: region
    - name: NEPTUNE_IAM_AUTH
      valueFrom:
        secretKeyRef:
          name: neptune-connection
          key: iam_auth
```

**Step 4: Verify Helm template renders correctly**

Run: `cd /apps/mosaic-life && helm template test infra/helm/mosaic-life/ 2>&1 | grep -A5 'neptune-connection'`
Expected: The ExternalSecret resource and env var references render without errors

**Step 5: Commit**

```bash
git add infra/helm/mosaic-life/templates/external-secrets.yaml infra/helm/mosaic-life/values.yaml
git commit -m "feat: add Neptune connection ExternalSecret and env vars to Helm chart"
```

---

### Task 5: Add TinkerPop Gremlin Server to Docker Compose

**Files:**
- Create: `infra/compose/neptune-local/gremlin-server.yaml`
- Modify: `infra/compose/docker-compose.yml`

**Step 1: Create the Gremlin Server configuration file**

Create `infra/compose/neptune-local/gremlin-server.yaml`:

```yaml
# Gremlin Server configuration for local Neptune development
# Supports both Gremlin and openCypher queries via HTTP
host: 0.0.0.0
port: 8182
evaluationTimeout: 120000
channelizer: org.apache.tinkerpop.gremlin.server.channel.HttpChannelizer
graphs: {
  graph: conf/tinkergraph-empty.properties
}
scriptEngines: {
  gremlin-groovy: {
    plugins: {
      org.apache.tinkerpop.gremlin.server.jsr223.GremlinServerGremlinPlugin: {},
      org.apache.tinkerpop.gremlin.tinkergraph.jsr223.TinkerGraphGremlinPlugin: {},
      org.apache.tinkerpop.gremlin.jsr223.ImportGremlinPlugin: {
        classImports: [java.lang.Math],
        methodImports: [java.lang.Math#*]
      },
      org.apache.tinkerpop.gremlin.jsr223.ScriptFileGremlinPlugin: {
        files: [scripts/empty-sample.groovy]
      }
    }
  }
}
```

**Step 2: Add Gremlin Server service to Docker Compose**

Add the following service to `infra/compose/docker-compose.yml` after the `postgres` service (before the `docs` service):

```yaml
  # Graph Database (TinkerPop Gremlin Server - Neptune-compatible local dev)
  neptune-local:
    image: tinkerpop/gremlin-server:3.7.3
    container_name: mosaic-neptune-local
    ports:
      - "18182:8182"
    volumes:
      - neptune-data:/opt/gremlin-server/data
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8182 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
```

Add `neptune-data` to the volumes section at the bottom of the file:

```yaml
  neptune-data:
    driver: local
```

**Step 3: Verify Docker Compose config is valid**

Run: `docker compose -f /apps/mosaic-life/infra/compose/docker-compose.yml config --quiet`
Expected: No output (valid config)

**Step 4: Commit**

```bash
git add infra/compose/neptune-local/ infra/compose/docker-compose.yml
git commit -m "feat: add TinkerPop Gremlin Server for local Neptune development"
```

---

### Task 6: Update CLAUDE.md with Neptune documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add Neptune to the architecture section**

In the "Simplified MVP Architecture" section of `CLAUDE.md`, add Neptune to the list of active components (after the S3 bullet):

```markdown
- **Neptune** (graph database): Social network relationships and story-extracted entity connections
```

Remove or update the line that says "❌ Neo4j graph database (using Postgres foreign keys)" since Neptune replaces this.

**Step 2: Add Neptune local dev info**

In the "Local Environment" section, add:

```markdown
- Neptune (TinkerPop): http://localhost:18182
```

**Step 3: Add Neptune commands to Common Development Commands**

In the "Database Operations" section, add Neptune commands:

```markdown
### Graph Database (Neptune/TinkerPop)

```bash
# Start the local graph database
docker compose -f infra/compose/docker-compose.yml up -d neptune-local

# Test connectivity
curl http://localhost:18182

# Submit a Gremlin query
curl -X POST http://localhost:18182/gremlin -d '{"gremlin": "g.V().count()"}'
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Neptune graph database documentation"
```

---

### Task 7: Verify CDK synth end-to-end

**Files:** None (validation only)

**Step 1: Run full CDK synth**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth --quiet 2>&1 | tail -5`
Expected: All stacks synthesize without errors

**Step 2: Check the Neptune stack specifically**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth MosaicNeptuneDatabaseStack 2>&1 | grep -c 'AWS::Neptune'`
Expected: Multiple Neptune resources (DBCluster, DBInstance, DBSubnetGroup, etc.)

**Step 3: Verify Docker Compose can start TinkerPop**

Run: `docker compose -f /apps/mosaic-life/infra/compose/docker-compose.yml up -d neptune-local && sleep 10 && curl -sf http://localhost:18182 && echo " OK"`
Expected: HTTP response from Gremlin Server + "OK"

Clean up: `docker compose -f /apps/mosaic-life/infra/compose/docker-compose.yml stop neptune-local`

---

## Summary

| Task | Description | Estimated files |
|------|-------------|----------------|
| 1 | Add Neptune CDK dependency | 2 (package.json, lock) |
| 2 | Create Neptune CDK stack | 1 |
| 3 | Register stack in CDK app | 1 |
| 4 | Add Helm External Secret + env vars | 2 |
| 5 | Add TinkerPop to Docker Compose | 2-3 |
| 6 | Update CLAUDE.md documentation | 1 |
| 7 | End-to-end verification | 0 (validation) |

**Total new/modified files:** ~9
**All tasks are independent except:** Task 3 depends on Task 2; Task 7 depends on all others.
