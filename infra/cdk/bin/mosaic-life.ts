#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsCertificateStack } from '../lib/dns-certificate-stack';
import { MosaicLifeStack } from '../lib/mosaic-life-stack';

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

// Option 1: DNS and Certificate only (lightweight, already deployed)
// Uncomment if you only need DNS/Certificate without Cognito
/*
const subdomains = [
  'frontend',
  'backend',
  'api',
  'graph',
  'chat',
];

new DnsCertificateStack(app, 'MosaicDnsCertificateStack', {
  env,
  domainName,
  hostedZoneId,
  subdomains,
  description: 'Route53 DNS and ACM Certificate for Mosaic Life (uses existing infrastructure)',
  tags: {
    Project: 'MosaicLife',
    Environment: 'prod',
    ManagedBy: 'CDK',
    Component: 'DNS',
  },
});
*/

// Option 2: Full application stack (Cognito, S3, ECR, etc.)
new MosaicLifeStack(app, 'MosaicLifeStack', {
  env,
  config: {
    domainName,
    hostedZoneId,
    vpcId, // Use existing VPC from infrastructure stack
    environment,
    tags: {
      Project: 'MosaicLife',
      Environment: environment,
      ManagedBy: 'CDK',
      Component: 'Application',
    },
  },
});

app.synth();
