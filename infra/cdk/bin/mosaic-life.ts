#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsCertificateStack } from '../lib/dns-certificate-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '033691785857',
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Domain configuration
const domainName = 'mosaiclife.me';
const hostedZoneId = process.env.HOSTED_ZONE_ID; // If exists, otherwise create new

// Subdomains that need to be in the certificate SANs
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

app.synth();
