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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBRW5DLGdFQUEyRDtBQUUzRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiw0QkFBNEI7QUFDNUIsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxjQUFjO0lBQzFELE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7Q0FDdEQsQ0FBQztBQUVGLG1EQUFtRDtBQUNuRCxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxNQUFNLENBQUM7QUFFcEUsdUJBQXVCO0FBQ3ZCLE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztBQUNuQywwREFBMEQ7QUFDMUQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksdUJBQXVCLENBQUM7QUFFM0Usc0RBQXNEO0FBQ3RELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLHVCQUF1QixDQUFDO0FBRTVELHFFQUFxRTtBQUNyRSw2REFBNkQ7QUFDN0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFzQkU7QUFFRiw0REFBNEQ7QUFDNUQsSUFBSSxtQ0FBZSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRTtJQUMxQyxHQUFHO0lBQ0gsTUFBTSxFQUFFO1FBQ04sVUFBVTtRQUNWLFlBQVk7UUFDWixLQUFLLEVBQUUsNkNBQTZDO1FBQ3BELFdBQVc7UUFDWCxJQUFJLEVBQUU7WUFDSixPQUFPLEVBQUUsWUFBWTtZQUNyQixXQUFXLEVBQUUsV0FBVztZQUN4QixTQUFTLEVBQUUsS0FBSztZQUNoQixTQUFTLEVBQUUsYUFBYTtTQUN6QjtLQUNGO0NBQ0YsQ0FBQyxDQUFDO0FBRUgsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IERuc0NlcnRpZmljYXRlU3RhY2sgfSBmcm9tICcuLi9saWIvZG5zLWNlcnRpZmljYXRlLXN0YWNrJztcbmltcG9ydCB7IE1vc2FpY0xpZmVTdGFjayB9IGZyb20gJy4uL2xpYi9tb3NhaWMtbGlmZS1zdGFjayc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbmNvbnN0IGVudiA9IHtcbiAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCB8fCAnMDMzNjkxNzg1ODU3JyxcbiAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG59O1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IChkZWZhdWx0IHRvICdwcm9kJylcbmNvbnN0IGVudmlyb25tZW50ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52aXJvbm1lbnQnKSB8fCAncHJvZCc7XG5cbi8vIERvbWFpbiBjb25maWd1cmF0aW9uXG5jb25zdCBkb21haW5OYW1lID0gJ21vc2FpY2xpZmUubWUnO1xuLy8gVXNlIGV4aXN0aW5nIGhvc3RlZCB6b25lIGZyb20gTW9zYWljRG5zQ2VydGlmaWNhdGVTdGFja1xuY29uc3QgaG9zdGVkWm9uZUlkID0gcHJvY2Vzcy5lbnYuSE9TVEVEX1pPTkVfSUQgfHwgJ1owMzk0ODc5MzBGNjk4N0NKTzRXOSc7XG5cbi8vIFVzZSBleGlzdGluZyBWUEMgZnJvbSBNb3NhaWNMaWZlSW5mcmFzdHJ1Y3R1cmVTdGFja1xuY29uc3QgdnBjSWQgPSBwcm9jZXNzLmVudi5WUENfSUQgfHwgJ3ZwYy0wY2RhNGNjNzQzMmRlY2EzMyc7XG5cbi8vIE9wdGlvbiAxOiBETlMgYW5kIENlcnRpZmljYXRlIG9ubHkgKGxpZ2h0d2VpZ2h0LCBhbHJlYWR5IGRlcGxveWVkKVxuLy8gVW5jb21tZW50IGlmIHlvdSBvbmx5IG5lZWQgRE5TL0NlcnRpZmljYXRlIHdpdGhvdXQgQ29nbml0b1xuLypcbmNvbnN0IHN1YmRvbWFpbnMgPSBbXG4gICdmcm9udGVuZCcsXG4gICdiYWNrZW5kJyxcbiAgJ2FwaScsXG4gICdncmFwaCcsXG4gICdjaGF0Jyxcbl07XG5cbm5ldyBEbnNDZXJ0aWZpY2F0ZVN0YWNrKGFwcCwgJ01vc2FpY0Ruc0NlcnRpZmljYXRlU3RhY2snLCB7XG4gIGVudixcbiAgZG9tYWluTmFtZSxcbiAgaG9zdGVkWm9uZUlkLFxuICBzdWJkb21haW5zLFxuICBkZXNjcmlwdGlvbjogJ1JvdXRlNTMgRE5TIGFuZCBBQ00gQ2VydGlmaWNhdGUgZm9yIE1vc2FpYyBMaWZlICh1c2VzIGV4aXN0aW5nIGluZnJhc3RydWN0dXJlKScsXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiAnTW9zYWljTGlmZScsXG4gICAgRW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICBNYW5hZ2VkQnk6ICdDREsnLFxuICAgIENvbXBvbmVudDogJ0ROUycsXG4gIH0sXG59KTtcbiovXG5cbi8vIE9wdGlvbiAyOiBGdWxsIGFwcGxpY2F0aW9uIHN0YWNrIChDb2duaXRvLCBTMywgRUNSLCBldGMuKVxubmV3IE1vc2FpY0xpZmVTdGFjayhhcHAsICdNb3NhaWNMaWZlU3RhY2snLCB7XG4gIGVudixcbiAgY29uZmlnOiB7XG4gICAgZG9tYWluTmFtZSxcbiAgICBob3N0ZWRab25lSWQsXG4gICAgdnBjSWQsIC8vIFVzZSBleGlzdGluZyBWUEMgZnJvbSBpbmZyYXN0cnVjdHVyZSBzdGFja1xuICAgIGVudmlyb25tZW50LFxuICAgIHRhZ3M6IHtcbiAgICAgIFByb2plY3Q6ICdNb3NhaWNMaWZlJyxcbiAgICAgIEVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIE1hbmFnZWRCeTogJ0NESycsXG4gICAgICBDb21wb25lbnQ6ICdBcHBsaWNhdGlvbicsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5hcHAuc3ludGgoKTtcbiJdfQ==