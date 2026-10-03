#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsCertificateStack } from '../lib/dns-certificate-stack';
import { MosaicLifeStack } from '../lib/mosaic-life-stack';
import { AuroraDatabaseStack } from '../lib/aurora-database-stack';
import { StagingResourcesStack } from '../lib/staging-resources-stack';
import { NeptuneDatabaseStack } from '../lib/neptune-database-stack';
import { LiteLLMSharedStack } from '../lib/litellm-shared-stack';
import { AlbAccessLogsStack } from '../lib/alb-access-logs-stack';

const app = new cdk.App();

// Graph backend context flag. Only `-c graph=neptune` wires Neptune IAM grants
// (and the cross-stack import of the Neptune export). Default: no Neptune coupling.
const graph: string | undefined = app.node.tryGetContext('graph');

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '033691785857',
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Domain configuration
const domainName = 'mosaiclife.me';
// Use existing hosted zone from MosaicDnsCertificateStack
const hostedZoneId = process.env.HOSTED_ZONE_ID || 'Z039487930F6987CJO4W9';

// Use existing VPC from MosaicLifeInfrastructureStack
const vpcId = process.env.VPC_ID || 'vpc-0cda4cc7432deca33';

// MosaicLifeStack is always the production stack
// Staging-specific resources are in MosaicStagingResourcesStack
const prodEnvironment = 'prod';

// Full application stack (Cognito, S3, ECR, etc.) - ALWAYS production
const appStack = new MosaicLifeStack(app, 'MosaicLifeStack', {
  env,
  config: {
    domainName,
    hostedZoneId,
    vpcId,
    existingUserPoolId: 'us-east-1_JLppKC09m',
    existingEcrRepos: true,
    existingS3Buckets: true,
    environment: prodEnvironment,
    graph,
    tags: {
      Project: 'MosaicLife',
      Environment: prodEnvironment,
      ManagedBy: 'CDK',
      Component: 'Application',
    },
  },
});

// Legacy data stacks (Aurora + LiteLLM) stay in the app until decommission. CI runs
// `cdk deploy --all`, so once they are destroyed they must be left out of the app
// (`-c legacyData=false`, or `"legacyData": false` in cdk.json) or the next merge
// would recreate them. Leaving a stack out of the app never deletes it.
const legacyData = app.node.tryGetContext('legacyData') !== false && app.node.tryGetContext('legacyData') !== 'false';

// Aurora Database Stack - migrated from RDS PostgreSQL for AGE extension support
// Originally restored from snapshot 'mosaic-pre-aurora-migration'; now the primary database.
if (legacyData) {
  new AuroraDatabaseStack(app, 'MosaicAuroraDatabaseStack', {
    env,
    vpc: appStack.vpc,
    environment: prodEnvironment,
    snapshotIdentifier: 'arn:aws:rds:us-east-1:033691785857:snapshot:mosaic-pre-aurora-migration',
  });
}

// Neptune Graph Database Stack — single shared cluster for all environments
// Data isolation via prefix-label strategy (see design doc). Only part of the app with
// `-c graph=neptune`; otherwise CI deploys would recreate it after retirement.
if (graph === 'neptune') {
  new NeptuneDatabaseStack(app, 'MosaicNeptuneDatabaseStack', {
    env,
    vpc: appStack.vpc,
    environments: [prodEnvironment, 'staging'],
  });
}

// Staging Resources Stack - S3 buckets, IAM roles, secrets for staging
new StagingResourcesStack(app, 'MosaicStagingResourcesStack', {
  env,
  vpc: appStack.vpc,
  domainName,
  graph,
});

// LiteLLM Shared Stack - IRSA role for the shared aiservices deployment
if (legacyData) {
  new LiteLLMSharedStack(app, 'MosaicLiteLLMSharedStack', {
    env,
  });
}

// ALB Access Logs Stack - Athena/Glue resources for querying ALB logs
new AlbAccessLogsStack(app, 'MosaicAlbAccessLogsStack', {
  env,
  logsBucket: 'mosaic-life-observability',
  athenaResultsLocation: 's3://mosaic-life-observability/athena/results/alb-logs/',
  accountId: env.account!,
  region: env.region!,
  logsPrefix: 'alb/access/shared',
  projectionStartDate: '2026/03/01',
});

app.synth();
