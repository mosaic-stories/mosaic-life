import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
export interface MosaicLifeStackProps extends cdk.StackProps {
    config: {
        domainName: string;
        hostedZoneId?: string;
        environment: string;
        vpcId?: string;
        existingUserPoolId?: string;
        existingEcrRepos?: boolean;
        existingS3Buckets?: boolean;
        tags: {
            [key: string]: string;
        };
    };
}
export declare class MosaicLifeStack extends cdk.Stack {
    readonly vpc: ec2.IVpc;
    readonly hostedZone: route53.IHostedZone;
    readonly certificate: acm.Certificate;
    readonly userPool: cognito.IUserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly mediaBucket: s3.IBucket;
    readonly repositories: {
        [key: string]: ecr.IRepository;
    };
    constructor(scope: Construct, id: string, props: MosaicLifeStackProps);
    private createEcrRepository;
}
