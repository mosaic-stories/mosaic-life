#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsCertificateStack } from '../lib/dns-certificate-stack';
import { MosaicLifeStack } from '../lib/mosaic-life-stack';
import { AuroraDatabaseStack } from '../lib/aurora-database-stack';
import { StagingResourcesStack } from '../lib/staging-resources-stack';

const app = new cdk.App();

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
    tags: {
      Project: 'MosaicLife',
      Environment: prodEnvironment,
      ManagedBy: 'CDK',
      Component: 'Application',
    },
  },
});

// Aurora Database Stack - migrated from RDS PostgreSQL for AGE extension support
// Originally restored from snapshot 'mosaic-pre-aurora-migration'; now the primary database.
new AuroraDatabaseStack(app, 'MosaicAuroraDatabaseStack', {
  env,
  vpc: appStack.vpc,
  environment: prodEnvironment,
  snapshotIdentifier: 'arn:aws:rds:us-east-1:033691785857:snapshot:mosaic-pre-aurora-migration',
});

// Staging Resources Stack - S3 buckets, IAM roles, secrets for staging
new StagingResourcesStack(app, 'MosaicStagingResourcesStack', {
  env,
  vpc: appStack.vpc,
  domainName,
});

app.synth();
