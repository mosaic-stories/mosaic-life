#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const mosaic_life_stack_1 = require("../lib/mosaic-life-stack");
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
new mosaic_life_stack_1.MosaicLifeStack(app, 'MosaicLifeStack', {
    env,
    config: {
        domainName,
        hostedZoneId,
        vpcId, // Use existing VPC from infrastructure stack
        existingUserPoolId: 'us-east-1_JLppKC09m', // Import existing Cognito User Pool
        existingEcrRepos: true, // Import existing ECR repositories
        existingS3Buckets: true, // Import existing S3 buckets
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBRW5DLGdFQUEyRDtBQUUzRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiw0QkFBNEI7QUFDNUIsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxjQUFjO0lBQzFELE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7Q0FDdEQsQ0FBQztBQUVGLG1EQUFtRDtBQUNuRCxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxNQUFNLENBQUM7QUFFcEUsdUJBQXVCO0FBQ3ZCLE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztBQUNuQywwREFBMEQ7QUFDMUQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksdUJBQXVCLENBQUM7QUFFM0Usc0RBQXNEO0FBQ3RELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLHVCQUF1QixDQUFDO0FBRTVELHFFQUFxRTtBQUNyRSw2REFBNkQ7QUFDN0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFzQkU7QUFFRiw0REFBNEQ7QUFDNUQsSUFBSSxtQ0FBZSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRTtJQUMxQyxHQUFHO0lBQ0gsTUFBTSxFQUFFO1FBQ04sVUFBVTtRQUNWLFlBQVk7UUFDWixLQUFLLEVBQUUsNkNBQTZDO1FBQ3BELGtCQUFrQixFQUFFLHFCQUFxQixFQUFFLG9DQUFvQztRQUMvRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsbUNBQW1DO1FBQzNELGlCQUFpQixFQUFFLElBQUksRUFBRSw2QkFBNkI7UUFDdEQsV0FBVztRQUNYLElBQUksRUFBRTtZQUNKLE9BQU8sRUFBRSxZQUFZO1lBQ3JCLFdBQVcsRUFBRSxXQUFXO1lBQ3hCLFNBQVMsRUFBRSxLQUFLO1lBQ2hCLFNBQVMsRUFBRSxhQUFhO1NBQ3pCO0tBQ0Y7Q0FDRixDQUFDLENBQUM7QUFFSCxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgJ3NvdXJjZS1tYXAtc3VwcG9ydC9yZWdpc3Rlcic7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRG5zQ2VydGlmaWNhdGVTdGFjayB9IGZyb20gJy4uL2xpYi9kbnMtY2VydGlmaWNhdGUtc3RhY2snO1xuaW1wb3J0IHsgTW9zYWljTGlmZVN0YWNrIH0gZnJvbSAnLi4vbGliL21vc2FpYy1saWZlLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuY29uc3QgZW52ID0ge1xuICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UIHx8ICcwMzM2OTE3ODU4NTcnLFxuICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbn07XG5cbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGNvbnRleHQgKGRlZmF1bHQgdG8gJ3Byb2QnKVxuY29uc3QgZW52aXJvbm1lbnQgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZpcm9ubWVudCcpIHx8ICdwcm9kJztcblxuLy8gRG9tYWluIGNvbmZpZ3VyYXRpb25cbmNvbnN0IGRvbWFpbk5hbWUgPSAnbW9zYWljbGlmZS5tZSc7XG4vLyBVc2UgZXhpc3RpbmcgaG9zdGVkIHpvbmUgZnJvbSBNb3NhaWNEbnNDZXJ0aWZpY2F0ZVN0YWNrXG5jb25zdCBob3N0ZWRab25lSWQgPSBwcm9jZXNzLmVudi5IT1NURURfWk9ORV9JRCB8fCAnWjAzOTQ4NzkzMEY2OTg3Q0pPNFc5JztcblxuLy8gVXNlIGV4aXN0aW5nIFZQQyBmcm9tIE1vc2FpY0xpZmVJbmZyYXN0cnVjdHVyZVN0YWNrXG5jb25zdCB2cGNJZCA9IHByb2Nlc3MuZW52LlZQQ19JRCB8fCAndnBjLTBjZGE0Y2M3NDMyZGVjYTMzJztcblxuLy8gT3B0aW9uIDE6IEROUyBhbmQgQ2VydGlmaWNhdGUgb25seSAobGlnaHR3ZWlnaHQsIGFscmVhZHkgZGVwbG95ZWQpXG4vLyBVbmNvbW1lbnQgaWYgeW91IG9ubHkgbmVlZCBETlMvQ2VydGlmaWNhdGUgd2l0aG91dCBDb2duaXRvXG4vKlxuY29uc3Qgc3ViZG9tYWlucyA9IFtcbiAgJ2Zyb250ZW5kJyxcbiAgJ2JhY2tlbmQnLFxuICAnYXBpJyxcbiAgJ2dyYXBoJyxcbiAgJ2NoYXQnLFxuXTtcblxubmV3IERuc0NlcnRpZmljYXRlU3RhY2soYXBwLCAnTW9zYWljRG5zQ2VydGlmaWNhdGVTdGFjaycsIHtcbiAgZW52LFxuICBkb21haW5OYW1lLFxuICBob3N0ZWRab25lSWQsXG4gIHN1YmRvbWFpbnMsXG4gIGRlc2NyaXB0aW9uOiAnUm91dGU1MyBETlMgYW5kIEFDTSBDZXJ0aWZpY2F0ZSBmb3IgTW9zYWljIExpZmUgKHVzZXMgZXhpc3RpbmcgaW5mcmFzdHJ1Y3R1cmUpJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdNb3NhaWNMaWZlJyxcbiAgICBFbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgIE1hbmFnZWRCeTogJ0NESycsXG4gICAgQ29tcG9uZW50OiAnRE5TJyxcbiAgfSxcbn0pO1xuKi9cblxuLy8gT3B0aW9uIDI6IEZ1bGwgYXBwbGljYXRpb24gc3RhY2sgKENvZ25pdG8sIFMzLCBFQ1IsIGV0Yy4pXG5uZXcgTW9zYWljTGlmZVN0YWNrKGFwcCwgJ01vc2FpY0xpZmVTdGFjaycsIHtcbiAgZW52LFxuICBjb25maWc6IHtcbiAgICBkb21haW5OYW1lLFxuICAgIGhvc3RlZFpvbmVJZCxcbiAgICB2cGNJZCwgLy8gVXNlIGV4aXN0aW5nIFZQQyBmcm9tIGluZnJhc3RydWN0dXJlIHN0YWNrXG4gICAgZXhpc3RpbmdVc2VyUG9vbElkOiAndXMtZWFzdC0xX0pMcHBLQzA5bScsIC8vIEltcG9ydCBleGlzdGluZyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGV4aXN0aW5nRWNyUmVwb3M6IHRydWUsIC8vIEltcG9ydCBleGlzdGluZyBFQ1IgcmVwb3NpdG9yaWVzXG4gICAgZXhpc3RpbmdTM0J1Y2tldHM6IHRydWUsIC8vIEltcG9ydCBleGlzdGluZyBTMyBidWNrZXRzXG4gICAgZW52aXJvbm1lbnQsXG4gICAgdGFnczoge1xuICAgICAgUHJvamVjdDogJ01vc2FpY0xpZmUnLFxuICAgICAgRW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgTWFuYWdlZEJ5OiAnQ0RLJyxcbiAgICAgIENvbXBvbmVudDogJ0FwcGxpY2F0aW9uJyxcbiAgICB9LFxuICB9LFxufSk7XG5cbmFwcC5zeW50aCgpO1xuIl19