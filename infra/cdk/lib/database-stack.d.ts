import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
export interface DatabaseStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    environment: string;
}
/**
 * RDS PostgreSQL Database Stack
 *
 * Cost-optimized configuration:
 * - db.t3.micro (2 vCPU, 1 GB RAM) - ~$13-15/month
 * - Single-AZ deployment (can upgrade to Multi-AZ later)
 * - 20 GB gp3 storage (scalable)
 * - 7-day automated backups
 * - PostgreSQL 16.x
 *
 * Upgrade path to production:
 * - Scale to db.t3.small or db.t3.medium
 * - Enable Multi-AZ for high availability
 * - Increase backup retention to 30 days
 * - Enable Performance Insights
 * - Add read replicas for scaling
 */
export declare class DatabaseStack extends cdk.Stack {
    readonly dbInstance: rds.DatabaseInstance;
    readonly dbSecret: secretsmanager.ISecret;
    readonly dbSecurityGroup: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props: DatabaseStackProps);
}
