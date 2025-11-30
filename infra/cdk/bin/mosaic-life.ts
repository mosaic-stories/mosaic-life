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
