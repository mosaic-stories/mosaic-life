import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
export interface DnsCertificateStackProps extends cdk.StackProps {
    domainName: string;
    hostedZoneId?: string;
    subdomains: string[];
}
/**
 * Minimal CDK stack that only creates DNS and Certificate resources
 * All other infrastructure (VPC, EKS, Cognito, S3, ECR) already exists
 * in the infrastructure repository
 */
export declare class DnsCertificateStack extends cdk.Stack {
    readonly hostedZone: route53.IHostedZone;
    readonly certificate: acm.Certificate;
    constructor(scope: Construct, id: string, props: DnsCertificateStackProps);
}
