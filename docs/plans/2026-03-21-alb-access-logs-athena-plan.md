# ALB Access Logs + Athena Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable ALB access logging to S3 for prod/staging and create Athena tables with partition projection for querying those logs.

**Architecture:** ALB access logs are enabled via `load-balancer-attributes` annotations on Kubernetes Ingress resources. Logs land in `s3://mosaic-life-observability/alb/access/{env}/`. A CDK stack creates Glue database + tables with partition projection so Athena can query logs without manual partition management.

**Tech Stack:** Helm (values overrides), AWS CDK (TypeScript), Glue, Athena

**Design doc:** `docs/plans/2026-03-21-alb-access-logs-athena-design.md`

---

### Task 1: Create CDK Stack for Athena/Glue Resources

**Files:**
- Create: `infra/cdk/lib/alb-access-logs-stack.ts`

**Step 1: Create the stack file**

Create `infra/cdk/lib/alb-access-logs-stack.ts` with:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import { Construct } from 'constructs';

interface AlbAccessLogsStackProps extends cdk.StackProps {
  /**
   * S3 bucket where ALB access logs are stored.
   */
  logsBucket: string;

  /**
   * S3 bucket + prefix for Athena query results.
   */
  athenaResultsLocation: string;

  /**
   * AWS account ID (used in S3 path structure).
   */
  accountId: string;

  /**
   * AWS region (used in S3 path structure).
   */
  region: string;

  /**
   * Environments to create tables for (e.g. ['prod', 'staging']).
   */
  environments: string[];

  /**
   * S3 prefix template per environment. Key = env name, value = S3 prefix.
   * Example: { prod: 'alb/access/prod', staging: 'alb/access/staging' }
   */
  prefixes: Record<string, string>;

  /**
   * Start date for partition projection range (yyyy/MM/dd format).
   */
  projectionStartDate: string;
}

export class AlbAccessLogsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AlbAccessLogsStackProps) {
    super(scope, id, props);

    // Glue Database
    const database = new glue.CfnDatabase(this, 'AlbLogsDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'mosaic_life_alb_logs',
        description: 'ALB access logs for Mosaic Life load balancers',
      },
    });

    // Athena WorkGroup
    new athena.CfnWorkGroup(this, 'AlbLogsWorkGroup', {
      name: 'mosaic-life-alb-logs',
      description: 'Workgroup for querying ALB access logs',
      state: 'ENABLED',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: props.athenaResultsLocation,
        },
        enforceWorkGroupConfiguration: false,
        publishCloudWatchMetricsEnabled: true,
        engineVersion: {
          selectedEngineVersion: 'Athena engine version 3',
        },
      },
      tags: [
        { key: 'Project', value: 'MosaicLife' },
        { key: 'ManagedBy', value: 'CDK' },
        { key: 'Component', value: 'Observability' },
      ],
    });

    // RegexSerDe input regex for ALB access logs
    const albLogRegex = '([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*)[:-]([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-.0-9]*) (|[-0-9]*) (-|[-0-9]*) ([-0-9]*) ([-0-9]*) \\"([^ ]*) (.*) (- |[^ ]*)\\" \\"([^\\"]*)\\" ([A-Z0-9-_]+) ([A-Za-z0-9.-]*) ([^ ]*) \\"([^\\"]*)\\" \\"([^\\"]*)\\" \\"([^\\"]*)\\" ([-.0-9]*) ([^ ]*) \\"([^\\"]*)\\" \\"([^\\"]*)\\" \\"([^ ]*)\\" \\"([^\\\\s]+?)\\" \\"([^\\\\s]+)\\" \\"([^ ]*)\\" \\"([^ ]*)\\" ?([^ ]*)? ?( .*)?';

    // Column definitions for ALB access logs
    const columns: glue.CfnTable.ColumnProperty[] = [
      { name: 'type', type: 'string' },
      { name: 'time', type: 'string' },
      { name: 'elb', type: 'string' },
      { name: 'client_ip', type: 'string' },
      { name: 'client_port', type: 'int' },
      { name: 'target_ip', type: 'string' },
      { name: 'target_port', type: 'int' },
      { name: 'request_processing_time', type: 'double' },
      { name: 'target_processing_time', type: 'double' },
      { name: 'response_processing_time', type: 'double' },
      { name: 'elb_status_code', type: 'int' },
      { name: 'target_status_code', type: 'string' },
      { name: 'received_bytes', type: 'bigint' },
      { name: 'sent_bytes', type: 'bigint' },
      { name: 'request_verb', type: 'string' },
      { name: 'request_url', type: 'string' },
      { name: 'request_proto', type: 'string' },
      { name: 'user_agent', type: 'string' },
      { name: 'ssl_cipher', type: 'string' },
      { name: 'ssl_protocol', type: 'string' },
      { name: 'target_group_arn', type: 'string' },
      { name: 'trace_id', type: 'string' },
      { name: 'domain_name', type: 'string' },
      { name: 'chosen_cert_arn', type: 'string' },
      { name: 'matched_rule_priority', type: 'string' },
      { name: 'request_creation_time', type: 'string' },
      { name: 'actions_executed', type: 'string' },
      { name: 'redirect_url', type: 'string' },
      { name: 'lambda_error_reason', type: 'string' },
      { name: 'target_port_list', type: 'string' },
      { name: 'target_status_code_list', type: 'string' },
      { name: 'classification', type: 'string' },
      { name: 'classification_reason', type: 'string' },
      { name: 'conn_trace_id', type: 'string' },
    ];

    // Create a table per environment
    for (const env of props.environments) {
      const prefix = props.prefixes[env];
      const s3Location = `s3://${props.logsBucket}/${prefix}/AWSLogs/${props.accountId}/elasticloadbalancing/${props.region}/`;
      const storageLocationTemplate = `s3://${props.logsBucket}/${prefix}/AWSLogs/${props.accountId}/elasticloadbalancing/${props.region}/\${day}`;

      const table = new glue.CfnTable(this, `AlbLogsTable-${env}`, {
        catalogId: this.account,
        databaseName: 'mosaic_life_alb_logs',
        tableInput: {
          name: `${env}_access_logs`,
          description: `ALB access logs for ${env} environment`,
          tableType: 'EXTERNAL_TABLE',
          parameters: {
            'projection.enabled': 'true',
            'projection.day.type': 'date',
            'projection.day.range': `${props.projectionStartDate},NOW`,
            'projection.day.format': 'yyyy/MM/dd',
            'projection.day.interval': '1',
            'projection.day.interval.unit': 'DAYS',
            'storage.location.template': storageLocationTemplate,
          },
          partitionKeys: [{ name: 'day', type: 'string' }],
          storageDescriptor: {
            columns,
            location: s3Location,
            inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
            outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
            serdeInfo: {
              serializationLibrary: 'org.apache.hadoop.hive.serde2.RegexSerDe',
              parameters: {
                'serialization.format': '1',
                'input.regex': albLogRegex,
              },
            },
          },
        },
      });

      table.addDependency(database);
    }

    cdk.Tags.of(this).add('Project', 'MosaicLife');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'Observability');
  }
}
```

**Step 2: Verify the file compiles**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit lib/alb-access-logs-stack.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add infra/cdk/lib/alb-access-logs-stack.ts
git commit -m "feat(observability): add CDK stack for ALB access logs Athena tables"
```

---

### Task 2: Register Stack in CDK Entry Point

**Files:**
- Modify: `infra/cdk/bin/mosaic-life.ts:1-80`

**Step 1: Add import and instantiation**

Add import at line 9 (after the LiteLLM import):

```typescript
import { AlbAccessLogsStack } from '../lib/alb-access-logs-stack';
```

Add stack instantiation before `app.synth()` (before line 80):

```typescript
// ALB Access Logs Stack - Athena/Glue resources for querying ALB logs
new AlbAccessLogsStack(app, 'MosaicAlbAccessLogsStack', {
  env,
  logsBucket: 'mosaic-life-observability',
  athenaResultsLocation: 's3://mosaic-life-observability/athena/results/alb-logs/',
  accountId: env.account!,
  region: env.region!,
  environments: ['prod', 'staging'],
  prefixes: {
    prod: 'alb/access/prod',
    staging: 'alb/access/staging',
  },
  projectionStartDate: '2026/03/01',
});
```

**Step 2: Verify CDK synth works**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth MosaicAlbAccessLogsStack --quiet`
Expected: No errors, generates CloudFormation template

**Step 3: Commit**

```bash
git add infra/cdk/bin/mosaic-life.ts
git commit -m "feat(observability): register ALB access logs stack in CDK app"
```

---

### Task 3: Add Access Log Annotations to Production Values

**Files:**
- Modify: `infra/helm/mosaic-life/values.yaml:51-66` (web ingress annotations)
- Modify: `infra/helm/mosaic-life/values.yaml:129-150` (core-api ingress annotations)

**Step 1: Add load-balancer-attributes to web ingress**

After line 65 (`alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"`), before the tags annotation, add:

```yaml
      alb.ingress.kubernetes.io/load-balancer-attributes: access_logs.s3.enabled=true,access_logs.s3.bucket=mosaic-life-observability,access_logs.s3.prefix=alb/access/prod
```

**Step 2: Append access log attributes to core-api load-balancer-attributes**

Replace line 145:

```yaml
      alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600
```

With:

```yaml
      alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600,access_logs.s3.enabled=true,access_logs.s3.bucket=mosaic-life-observability,access_logs.s3.prefix=alb/access/prod
```

**Step 3: Verify Helm template renders**

Run: `cd /apps/mosaic-life && helm template test infra/helm/mosaic-life/ | grep -A2 "load-balancer-attributes"`
Expected: Both web and core-api ingresses show the access log attributes

**Step 4: Commit**

```bash
git add infra/helm/mosaic-life/values.yaml
git commit -m "feat(observability): enable ALB access logs for production"
```

---

### Task 4: Add Access Log Annotations to Staging Values

**Files:**
- Modify: `infra/helm/mosaic-life/values-staging.yaml:14-16` (web ingress annotations)
- Modify: `infra/helm/mosaic-life/values-staging.yaml` (add core-api ingress annotations)

**Step 1: Add load-balancer-attributes to staging web ingress annotations**

In the `web.ingress.annotations` section (after line 16), add:

```yaml
      alb.ingress.kubernetes.io/load-balancer-attributes: access_logs.s3.enabled=true,access_logs.s3.bucket=mosaic-life-observability,access_logs.s3.prefix=alb/access/staging
```

**Step 2: Add core-api ingress annotations section for staging**

Add a new `coreApi.ingress.annotations` section to override the base values:

```yaml
  ingress:
    annotations:
      alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600,access_logs.s3.enabled=true,access_logs.s3.bucket=mosaic-life-observability,access_logs.s3.prefix=alb/access/staging
```

**Step 3: Verify Helm template renders with staging overrides**

Run: `cd /apps/mosaic-life && helm template test infra/helm/mosaic-life/ -f infra/helm/mosaic-life/values-staging.yaml | grep -A2 "load-balancer-attributes"`
Expected: Both ingresses show staging prefix

**Step 4: Commit**

```bash
git add infra/helm/mosaic-life/values-staging.yaml
git commit -m "feat(observability): enable ALB access logs for staging"
```

---

### Task 5: Final Validation

**Step 1: Verify CDK compiles cleanly**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit`
Expected: No errors

**Step 2: Verify CDK synth for the new stack**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth MosaicAlbAccessLogsStack --quiet`
Expected: Clean synthesis

**Step 3: Verify Helm templates for prod**

Run: `cd /apps/mosaic-life && helm template test infra/helm/mosaic-life/ | grep "access_logs"`
Expected: access_logs attributes appear in both web and core-api ingresses

**Step 4: Verify Helm templates for staging**

Run: `cd /apps/mosaic-life && helm template test infra/helm/mosaic-life/ -f infra/helm/mosaic-life/values-staging.yaml | grep "access_logs"`
Expected: staging prefix in both ingresses

---

### Post-Implementation: Infrastructure Repo (Out of Scope)

After all changes in this repo are merged and deployed, update the S3 bucket policy in the infrastructure repo (`/apps/mosaic-life-infrastructure`) to allow the ELB service account (`127311923021` for us-east-1) to write to `s3://mosaic-life-observability/alb/access/*`. Without this, ALB access log delivery will silently fail.
