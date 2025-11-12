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
const database_stack_1 = require("../lib/database-stack");
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
const appStack = new mosaic_life_stack_1.MosaicLifeStack(app, 'MosaicLifeStack', {
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
// Database Stack - RDS PostgreSQL
new database_stack_1.DatabaseStack(app, 'MosaicDatabaseStack', {
    env,
    vpc: appStack.vpc,
    environment,
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBRW5DLGdFQUEyRDtBQUMzRCwwREFBc0Q7QUFFdEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNEJBQTRCO0FBQzVCLE1BQU0sR0FBRyxHQUFHO0lBQ1YsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksY0FBYztJQUMxRCxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxXQUFXO0NBQ3RELENBQUM7QUFFRixtREFBbUQ7QUFDbkQsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksTUFBTSxDQUFDO0FBRXBFLHVCQUF1QjtBQUN2QixNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUM7QUFDbkMsMERBQTBEO0FBQzFELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLHVCQUF1QixDQUFDO0FBRTNFLHNEQUFzRDtBQUN0RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSx1QkFBdUIsQ0FBQztBQUU1RCxxRUFBcUU7QUFDckUsNkRBQTZEO0FBQzdEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBc0JFO0FBRUYsNERBQTREO0FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksbUNBQWUsQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUU7SUFDM0QsR0FBRztJQUNILE1BQU0sRUFBRTtRQUNOLFVBQVU7UUFDVixZQUFZO1FBQ1osS0FBSyxFQUFFLDZDQUE2QztRQUNwRCxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxvQ0FBb0M7UUFDL0UsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLG1DQUFtQztRQUMzRCxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsNkJBQTZCO1FBQ3RELFdBQVc7UUFDWCxJQUFJLEVBQUU7WUFDSixPQUFPLEVBQUUsWUFBWTtZQUNyQixXQUFXLEVBQUUsV0FBVztZQUN4QixTQUFTLEVBQUUsS0FBSztZQUNoQixTQUFTLEVBQUUsYUFBYTtTQUN6QjtLQUNGO0NBQ0YsQ0FBQyxDQUFDO0FBRUgsa0NBQWtDO0FBQ2xDLElBQUksOEJBQWEsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLEVBQUU7SUFDNUMsR0FBRztJQUNILEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRztJQUNqQixXQUFXO0NBQ1osQ0FBQyxDQUFDO0FBRUgsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IERuc0NlcnRpZmljYXRlU3RhY2sgfSBmcm9tICcuLi9saWIvZG5zLWNlcnRpZmljYXRlLXN0YWNrJztcbmltcG9ydCB7IE1vc2FpY0xpZmVTdGFjayB9IGZyb20gJy4uL2xpYi9tb3NhaWMtbGlmZS1zdGFjayc7XG5pbXBvcnQgeyBEYXRhYmFzZVN0YWNrIH0gZnJvbSAnLi4vbGliL2RhdGFiYXNlLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuY29uc3QgZW52ID0ge1xuICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UIHx8ICcwMzM2OTE3ODU4NTcnLFxuICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbn07XG5cbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGNvbnRleHQgKGRlZmF1bHQgdG8gJ3Byb2QnKVxuY29uc3QgZW52aXJvbm1lbnQgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZpcm9ubWVudCcpIHx8ICdwcm9kJztcblxuLy8gRG9tYWluIGNvbmZpZ3VyYXRpb25cbmNvbnN0IGRvbWFpbk5hbWUgPSAnbW9zYWljbGlmZS5tZSc7XG4vLyBVc2UgZXhpc3RpbmcgaG9zdGVkIHpvbmUgZnJvbSBNb3NhaWNEbnNDZXJ0aWZpY2F0ZVN0YWNrXG5jb25zdCBob3N0ZWRab25lSWQgPSBwcm9jZXNzLmVudi5IT1NURURfWk9ORV9JRCB8fCAnWjAzOTQ4NzkzMEY2OTg3Q0pPNFc5JztcblxuLy8gVXNlIGV4aXN0aW5nIFZQQyBmcm9tIE1vc2FpY0xpZmVJbmZyYXN0cnVjdHVyZVN0YWNrXG5jb25zdCB2cGNJZCA9IHByb2Nlc3MuZW52LlZQQ19JRCB8fCAndnBjLTBjZGE0Y2M3NDMyZGVjYTMzJztcblxuLy8gT3B0aW9uIDE6IEROUyBhbmQgQ2VydGlmaWNhdGUgb25seSAobGlnaHR3ZWlnaHQsIGFscmVhZHkgZGVwbG95ZWQpXG4vLyBVbmNvbW1lbnQgaWYgeW91IG9ubHkgbmVlZCBETlMvQ2VydGlmaWNhdGUgd2l0aG91dCBDb2duaXRvXG4vKlxuY29uc3Qgc3ViZG9tYWlucyA9IFtcbiAgJ2Zyb250ZW5kJyxcbiAgJ2JhY2tlbmQnLFxuICAnYXBpJyxcbiAgJ2dyYXBoJyxcbiAgJ2NoYXQnLFxuXTtcblxubmV3IERuc0NlcnRpZmljYXRlU3RhY2soYXBwLCAnTW9zYWljRG5zQ2VydGlmaWNhdGVTdGFjaycsIHtcbiAgZW52LFxuICBkb21haW5OYW1lLFxuICBob3N0ZWRab25lSWQsXG4gIHN1YmRvbWFpbnMsXG4gIGRlc2NyaXB0aW9uOiAnUm91dGU1MyBETlMgYW5kIEFDTSBDZXJ0aWZpY2F0ZSBmb3IgTW9zYWljIExpZmUgKHVzZXMgZXhpc3RpbmcgaW5mcmFzdHJ1Y3R1cmUpJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdNb3NhaWNMaWZlJyxcbiAgICBFbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgIE1hbmFnZWRCeTogJ0NESycsXG4gICAgQ29tcG9uZW50OiAnRE5TJyxcbiAgfSxcbn0pO1xuKi9cblxuLy8gT3B0aW9uIDI6IEZ1bGwgYXBwbGljYXRpb24gc3RhY2sgKENvZ25pdG8sIFMzLCBFQ1IsIGV0Yy4pXG5jb25zdCBhcHBTdGFjayA9IG5ldyBNb3NhaWNMaWZlU3RhY2soYXBwLCAnTW9zYWljTGlmZVN0YWNrJywge1xuICBlbnYsXG4gIGNvbmZpZzoge1xuICAgIGRvbWFpbk5hbWUsXG4gICAgaG9zdGVkWm9uZUlkLFxuICAgIHZwY0lkLCAvLyBVc2UgZXhpc3RpbmcgVlBDIGZyb20gaW5mcmFzdHJ1Y3R1cmUgc3RhY2tcbiAgICBleGlzdGluZ1VzZXJQb29sSWQ6ICd1cy1lYXN0LTFfSkxwcEtDMDltJywgLy8gSW1wb3J0IGV4aXN0aW5nIENvZ25pdG8gVXNlciBQb29sXG4gICAgZXhpc3RpbmdFY3JSZXBvczogdHJ1ZSwgLy8gSW1wb3J0IGV4aXN0aW5nIEVDUiByZXBvc2l0b3JpZXNcbiAgICBleGlzdGluZ1MzQnVja2V0czogdHJ1ZSwgLy8gSW1wb3J0IGV4aXN0aW5nIFMzIGJ1Y2tldHNcbiAgICBlbnZpcm9ubWVudCxcbiAgICB0YWdzOiB7XG4gICAgICBQcm9qZWN0OiAnTW9zYWljTGlmZScsXG4gICAgICBFbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBNYW5hZ2VkQnk6ICdDREsnLFxuICAgICAgQ29tcG9uZW50OiAnQXBwbGljYXRpb24nLFxuICAgIH0sXG4gIH0sXG59KTtcblxuLy8gRGF0YWJhc2UgU3RhY2sgLSBSRFMgUG9zdGdyZVNRTFxubmV3IERhdGFiYXNlU3RhY2soYXBwLCAnTW9zYWljRGF0YWJhc2VTdGFjaycsIHtcbiAgZW52LFxuICB2cGM6IGFwcFN0YWNrLnZwYyxcbiAgZW52aXJvbm1lbnQsXG59KTtcblxuYXBwLnN5bnRoKCk7XG4iXX0=