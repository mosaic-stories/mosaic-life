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
const dns_certificate_stack_1 = require("../lib/dns-certificate-stack");
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
new dns_certificate_stack_1.DnsCertificateStack(app, 'MosaicDnsCertificateStack', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLHdFQUFtRTtBQUVuRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiw0QkFBNEI7QUFDNUIsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxjQUFjO0lBQzFELE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7Q0FDdEQsQ0FBQztBQUVGLHVCQUF1QjtBQUN2QixNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUM7QUFDbkMsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxrQ0FBa0M7QUFFbkYscURBQXFEO0FBQ3JELE1BQU0sVUFBVSxHQUFHO0lBQ2pCLFVBQVU7SUFDVixTQUFTO0lBQ1QsS0FBSztJQUNMLE9BQU87SUFDUCxNQUFNO0NBQ1AsQ0FBQztBQUVGLElBQUksMkNBQW1CLENBQUMsR0FBRyxFQUFFLDJCQUEyQixFQUFFO0lBQ3hELEdBQUc7SUFDSCxVQUFVO0lBQ1YsWUFBWTtJQUNaLFVBQVU7SUFDVixXQUFXLEVBQUUsZ0ZBQWdGO0lBQzdGLElBQUksRUFBRTtRQUNKLE9BQU8sRUFBRSxZQUFZO1FBQ3JCLFdBQVcsRUFBRSxNQUFNO1FBQ25CLFNBQVMsRUFBRSxLQUFLO1FBQ2hCLFNBQVMsRUFBRSxLQUFLO0tBQ2pCO0NBQ0YsQ0FBQyxDQUFDO0FBRUgsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IERuc0NlcnRpZmljYXRlU3RhY2sgfSBmcm9tICcuLi9saWIvZG5zLWNlcnRpZmljYXRlLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuY29uc3QgZW52ID0ge1xuICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UIHx8ICcwMzM2OTE3ODU4NTcnLFxuICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbn07XG5cbi8vIERvbWFpbiBjb25maWd1cmF0aW9uXG5jb25zdCBkb21haW5OYW1lID0gJ21vc2FpY2xpZmUubWUnO1xuY29uc3QgaG9zdGVkWm9uZUlkID0gcHJvY2Vzcy5lbnYuSE9TVEVEX1pPTkVfSUQ7IC8vIElmIGV4aXN0cywgb3RoZXJ3aXNlIGNyZWF0ZSBuZXdcblxuLy8gU3ViZG9tYWlucyB0aGF0IG5lZWQgdG8gYmUgaW4gdGhlIGNlcnRpZmljYXRlIFNBTnNcbmNvbnN0IHN1YmRvbWFpbnMgPSBbXG4gICdmcm9udGVuZCcsXG4gICdiYWNrZW5kJyxcbiAgJ2FwaScsXG4gICdncmFwaCcsXG4gICdjaGF0Jyxcbl07XG5cbm5ldyBEbnNDZXJ0aWZpY2F0ZVN0YWNrKGFwcCwgJ01vc2FpY0Ruc0NlcnRpZmljYXRlU3RhY2snLCB7XG4gIGVudixcbiAgZG9tYWluTmFtZSxcbiAgaG9zdGVkWm9uZUlkLFxuICBzdWJkb21haW5zLFxuICBkZXNjcmlwdGlvbjogJ1JvdXRlNTMgRE5TIGFuZCBBQ00gQ2VydGlmaWNhdGUgZm9yIE1vc2FpYyBMaWZlICh1c2VzIGV4aXN0aW5nIGluZnJhc3RydWN0dXJlKScsXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiAnTW9zYWljTGlmZScsXG4gICAgRW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICBNYW5hZ2VkQnk6ICdDREsnLFxuICAgIENvbXBvbmVudDogJ0ROUycsXG4gIH0sXG59KTtcblxuYXBwLnN5bnRoKCk7XG4iXX0=