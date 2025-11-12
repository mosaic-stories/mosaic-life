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
exports.MosaicLifeStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
class MosaicLifeStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { domainName, hostedZoneId, environment, vpcId, existingUserPoolId, existingEcrRepos, existingS3Buckets } = props.config;
        // ============================================================
        // VPC for EKS
        // ============================================================
        if (vpcId) {
            // Use existing VPC from infrastructure stack
            this.vpc = ec2.Vpc.fromVpcAttributes(this, 'MosaicVPC', {
                vpcId,
                vpcCidrBlock: '10.0.0.0/16', // CIDR block of the existing VPC
                availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
                publicSubnetIds: [
                    'subnet-0d1d24670c22d0a24', // us-east-1a
                    'subnet-0828639a62b580936', // us-east-1b
                    'subnet-0e4ec4b042daa6718', // us-east-1c
                ],
                privateSubnetIds: [
                    'subnet-07a61c97e2e16d91b', // us-east-1a
                    'subnet-079dd0d7be41e96a5', // us-east-1b
                    'subnet-01e6823eddd4a9a94', // us-east-1c
                ],
            });
        }
        else {
            // Create new VPC (only if no existing VPC provided)
            this.vpc = new ec2.Vpc(this, 'MosaicVPC', {
                vpcName: `mosaic-${environment}-vpc`,
                maxAzs: 3,
                natGateways: 2, // High availability
                subnetConfiguration: [
                    {
                        name: 'Public',
                        subnetType: ec2.SubnetType.PUBLIC,
                        cidrMask: 24,
                    },
                    {
                        name: 'Private',
                        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                        cidrMask: 20,
                    },
                ],
                enableDnsHostnames: true,
                enableDnsSupport: true,
            });
            // Tag subnets for EKS (only for new VPC)
            cdk.Tags.of(this.vpc).add('kubernetes.io/cluster/mosaic-life', 'shared');
            this.vpc.publicSubnets.forEach((subnet, index) => {
                cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
                cdk.Tags.of(subnet).add('Name', `mosaic-${environment}-public-${index + 1}`);
            });
            this.vpc.privateSubnets.forEach((subnet, index) => {
                cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
                cdk.Tags.of(subnet).add('Name', `mosaic-${environment}-private-${index + 1}`);
            });
            // VPC Endpoints for AWS services to reduce NAT costs (only for new VPC)
            this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            });
            this.vpc.addInterfaceEndpoint('ECRApiEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.ECR,
            });
            this.vpc.addInterfaceEndpoint('ECRDockerEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            });
            this.vpc.addGatewayEndpoint('S3Endpoint', {
                service: ec2.GatewayVpcEndpointAwsService.S3,
            });
        }
        // ============================================================
        // Route53 Hosted Zone
        // ============================================================
        if (hostedZoneId) {
            // Use existing hosted zone
            this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
                hostedZoneId,
                zoneName: domainName,
            });
        }
        else {
            // Create new hosted zone
            this.hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
                zoneName: domainName,
                comment: `Hosted zone for ${domainName}`,
            });
            new cdk.CfnOutput(this, 'NameServers', {
                value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers || []),
                description: 'Update your domain registrar with these name servers',
            });
        }
        // ============================================================
        // ACM Certificate with SANs
        // ============================================================
        this.certificate = new acm.Certificate(this, 'Certificate', {
            domainName,
            subjectAlternativeNames: [
                `*.${domainName}`,
                `frontend.${domainName}`,
                `backend.${domainName}`,
                `graph.${domainName}`,
                `chat.${domainName}`,
            ],
            validation: acm.CertificateValidation.fromDns(this.hostedZone),
        });
        // ============================================================
        // Cognito User Pool with Social Logins
        // ============================================================
        if (existingUserPoolId) {
            // Import existing User Pool
            this.userPool = cognito.UserPool.fromUserPoolId(this, 'UserPool', existingUserPoolId);
        }
        else {
            // Create new User Pool
            this.userPool = new cognito.UserPool(this, 'UserPool', {
                userPoolName: `mosaic-${environment}-users`,
                selfSignUpEnabled: true,
                signInAliases: {
                    email: true,
                    username: false,
                },
                autoVerify: {
                    email: true,
                },
                standardAttributes: {
                    email: {
                        required: true,
                        mutable: true,
                    },
                    givenName: {
                        required: false,
                        mutable: true,
                    },
                    familyName: {
                        required: false,
                        mutable: true,
                    },
                },
                customAttributes: {
                    // Note: custom attribute names must be <= 20 chars
                    // This will appear as "custom:relationship" in tokens
                    relationship: new cognito.StringAttribute({
                        mutable: true,
                    }),
                },
                passwordPolicy: {
                    minLength: 12,
                    requireLowercase: true,
                    requireUppercase: true,
                    requireDigits: true,
                    requireSymbols: true,
                    tempPasswordValidity: cdk.Duration.days(3),
                },
                accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
                removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
                mfa: cognito.Mfa.OPTIONAL,
                mfaSecondFactor: {
                    sms: true,
                    otp: true,
                },
                // Note: advancedSecurityMode removed - requires Cognito Plus plan
                // For basic security, Cognito provides standard protections by default
            });
        }
        // User Pool Domain for Cognito hosted UI
        const userPoolDomain = this.userPool.addDomain('CognitoDomain', {
            cognitoDomain: {
                domainPrefix: `mosaic-${environment}-${this.account}`,
            },
        });
        // App Client for OIDC flow
        this.userPoolClient = this.userPool.addClient('WebAppClient', {
            userPoolClientName: 'mosaic-web-client',
            generateSecret: true,
            authFlows: {
                userPassword: true,
                userSrp: true,
                custom: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [
                    `https://${domainName}/auth/callback`,
                    `https://frontend.${domainName}/auth/callback`,
                    'http://localhost:5173/auth/callback', // Dev
                ],
                logoutUrls: [
                    `https://${domainName}`,
                    `https://frontend.${domainName}`,
                    'http://localhost:5173',
                ],
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
                // Social providers will be added after configuration
            ],
            preventUserExistenceErrors: true,
            enableTokenRevocation: true,
            accessTokenValidity: cdk.Duration.minutes(60),
            idTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(30),
        });
        // Google Identity Provider (requires manual configuration)
        const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
            userPool: this.userPool,
            clientId: process.env.GOOGLE_CLIENT_ID || 'REPLACE_WITH_GOOGLE_CLIENT_ID',
            clientSecretValue: cdk.SecretValue.unsafePlainText(process.env.GOOGLE_CLIENT_SECRET || 'REPLACE_WITH_GOOGLE_CLIENT_SECRET'),
            scopes: ['profile', 'email', 'openid'],
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
            },
        });
        // GitHub Identity Provider (requires manual configuration)
        const githubProvider = new cognito.UserPoolIdentityProviderOidc(this, 'GitHubProvider', {
            userPool: this.userPool,
            name: 'GitHub',
            clientId: process.env.GITHUB_CLIENT_ID || 'REPLACE_WITH_GITHUB_CLIENT_ID',
            clientSecret: process.env.GITHUB_CLIENT_SECRET || 'REPLACE_WITH_GITHUB_CLIENT_SECRET',
            issuerUrl: 'https://token.actions.githubusercontent.com',
            scopes: ['openid', 'email', 'profile'],
            attributeMapping: {
                email: cognito.ProviderAttribute.other('email'),
                givenName: cognito.ProviderAttribute.other('name'),
            },
        });
        // Store Cognito configuration in Secrets Manager
        const cognitoSecret = new secretsmanager.Secret(this, 'CognitoConfig', {
            secretName: `mosaic/${environment}/cognito-config`,
            description: 'Cognito configuration for Mosaic Life',
            secretObjectValue: {
                userPoolId: cdk.SecretValue.unsafePlainText(this.userPool.userPoolId),
                userPoolClientId: cdk.SecretValue.unsafePlainText(this.userPoolClient.userPoolClientId),
                userPoolDomain: cdk.SecretValue.unsafePlainText(userPoolDomain.domainName),
                region: cdk.SecretValue.unsafePlainText(this.region),
            },
        });
        // ============================================================
        // S3 Buckets
        // ============================================================
        // Media storage bucket
        if (existingS3Buckets) {
            // Import existing bucket
            this.mediaBucket = s3.Bucket.fromBucketName(this, 'MediaBucket', `mosaic-${environment}-media-${this.account}`);
        }
        else {
            // Create new bucket
            this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
                bucketName: `mosaic-${environment}-media-${this.account}`,
                encryption: s3.BucketEncryption.S3_MANAGED,
                versioned: true,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
                autoDeleteObjects: environment !== 'prod',
                lifecycleRules: [
                    {
                        id: 'TransitionToIA',
                        enabled: true,
                        transitions: [
                            {
                                storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                                transitionAfter: cdk.Duration.days(90),
                            },
                            {
                                storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
                                transitionAfter: cdk.Duration.days(180),
                            },
                        ],
                    },
                    {
                        id: 'DeleteOldVersions',
                        enabled: true,
                        noncurrentVersionExpiration: cdk.Duration.days(90),
                    },
                ],
                cors: [
                    {
                        allowedMethods: [
                            s3.HttpMethods.GET,
                            s3.HttpMethods.PUT,
                            s3.HttpMethods.POST,
                            s3.HttpMethods.DELETE,
                        ],
                        allowedOrigins: [
                            `https://${domainName}`,
                            `https://*.${domainName}`,
                            'http://localhost:5173',
                        ],
                        allowedHeaders: ['*'],
                        exposedHeaders: ['ETag'],
                        maxAge: 3000,
                    },
                ],
            });
        }
        // Backup bucket
        let backupBucket;
        if (existingS3Buckets) {
            backupBucket = s3.Bucket.fromBucketName(this, 'BackupBucket', `mosaic-${environment}-backups-${this.account}`);
        }
        else {
            backupBucket = new s3.Bucket(this, 'BackupBucket', {
                bucketName: `mosaic-${environment}-backups-${this.account}`,
                encryption: s3.BucketEncryption.S3_MANAGED,
                versioned: true,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
                lifecycleRules: [
                    {
                        id: 'ArchiveOldBackups',
                        enabled: true,
                        transitions: [
                            {
                                storageClass: s3.StorageClass.GLACIER,
                                transitionAfter: cdk.Duration.days(30),
                            },
                        ],
                        expiration: cdk.Duration.days(365),
                    },
                ],
            });
        }
        // ============================================================
        // ECR Repositories
        // ============================================================
        if (existingEcrRepos) {
            // Import existing ECR repositories
            this.repositories = {
                web: ecr.Repository.fromRepositoryName(this, 'webRepository', 'mosaic-life/web'),
                coreApi: ecr.Repository.fromRepositoryName(this, 'coreApiRepository', 'mosaic-life/core-api'),
            };
        }
        else {
            // Create new ECR repositories
            this.repositories = {
                web: this.createEcrRepository('web', 'Frontend web application'),
                coreApi: this.createEcrRepository('core-api', 'Core backend API'),
            };
        }
        // ============================================================
        // SNS/SQS for Event-Driven Architecture
        // ============================================================
        const domainEventsTopic = new sns.Topic(this, 'DomainEventsTopic', {
            topicName: `mosaic-${environment}-domain-events`,
            displayName: 'Mosaic Life Domain Events',
        });
        // Dead letter queue for failed event processing
        const eventsDlq = new sqs.Queue(this, 'EventsDLQ', {
            queueName: `mosaic-${environment}-events-dlq`,
            retentionPeriod: cdk.Duration.days(14),
        });
        // Events queue for processing
        const eventsQueue = new sqs.Queue(this, 'EventsQueue', {
            queueName: `mosaic-${environment}-events`,
            visibilityTimeout: cdk.Duration.seconds(300),
            deadLetterQueue: {
                queue: eventsDlq,
                maxReceiveCount: 3,
            },
        });
        domainEventsTopic.addSubscription(new cdk.aws_sns_subscriptions.SqsSubscription(eventsQueue));
        // ============================================================
        // IAM Roles for EKS IRSA
        // ============================================================
        // Role for core-api to access S3, Secrets Manager, SQS/SNS
        const coreApiRole = new iam.Role(this, 'CoreApiRole', {
            roleName: `mosaic-${environment}-core-api-role`,
            assumedBy: new iam.WebIdentityPrincipal(`arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_ID`, {
                StringEquals: {
                    'oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_ID:sub': 'system:serviceaccount:mosaiclife:core-api',
                    'oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_ID:aud': 'sts.amazonaws.com',
                },
            }),
            description: 'IAM role for core-api service in EKS',
        });
        // Grant permissions to core-api role
        this.mediaBucket.grantReadWrite(coreApiRole);
        backupBucket.grantReadWrite(coreApiRole);
        cognitoSecret.grantRead(coreApiRole);
        domainEventsTopic.grantPublish(coreApiRole);
        eventsQueue.grantConsumeMessages(coreApiRole);
        // ============================================================
        // Outputs
        // ============================================================
        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'VPC ID for EKS cluster',
            exportName: `mosaic-${environment}-vpc-id`,
        });
        new cdk.CfnOutput(this, 'CertificateArn', {
            value: this.certificate.certificateArn,
            description: 'ACM Certificate ARN for ALB',
            exportName: `mosaic-${environment}-certificate-arn`,
        });
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: `mosaic-${environment}-user-pool-id`,
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: `mosaic-${environment}-user-pool-client-id`,
        });
        new cdk.CfnOutput(this, 'UserPoolDomain', {
            value: userPoolDomain.domainName,
            description: 'Cognito User Pool Domain',
        });
        new cdk.CfnOutput(this, 'MediaBucketName', {
            value: this.mediaBucket.bucketName,
            description: 'S3 bucket for media storage',
            exportName: `mosaic-${environment}-media-bucket`,
        });
        new cdk.CfnOutput(this, 'DomainEventsTopicArn', {
            value: domainEventsTopic.topicArn,
            description: 'SNS topic for domain events',
            exportName: `mosaic-${environment}-domain-events-topic`,
        });
        new cdk.CfnOutput(this, 'HostedZoneId', {
            value: this.hostedZone.hostedZoneId,
            description: 'Route53 Hosted Zone ID',
        });
        Object.entries(this.repositories).forEach(([name, repo]) => {
            new cdk.CfnOutput(this, `${name}RepositoryUri`, {
                value: repo.repositoryUri,
                description: `ECR repository URI for ${name}`,
                exportName: `mosaic-${environment}-ecr-${name}`,
            });
        });
    }
    createEcrRepository(name, description) {
        return new ecr.Repository(this, `${name}Repository`, {
            repositoryName: `mosaic-life/${name}`,
            imageScanOnPush: true,
            imageTagMutability: ecr.TagMutability.MUTABLE,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [
                {
                    description: 'Keep last 10 images',
                    maxImageCount: 10,
                    rulePriority: 1,
                    tagStatus: ecr.TagStatus.ANY,
                },
            ],
        });
    }
}
exports.MosaicLifeStack = MosaicLifeStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxpRUFBbUQ7QUFDbkQsd0VBQTBEO0FBQzFELGlFQUFtRDtBQUNuRCx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLCtFQUFpRTtBQUNqRSx5REFBMkM7QUFDM0MseURBQTJDO0FBZ0IzQyxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFTNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUUvSCwrREFBK0Q7UUFDL0QsY0FBYztRQUNkLCtEQUErRDtRQUMvRCxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1YsNkNBQTZDO1lBQzdDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFO2dCQUN0RCxLQUFLO2dCQUNMLFlBQVksRUFBRSxhQUFhLEVBQUUsaUNBQWlDO2dCQUM5RCxpQkFBaUIsRUFBRSxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDO2dCQUM3RCxlQUFlLEVBQUU7b0JBQ2YsMEJBQTBCLEVBQUUsYUFBYTtvQkFDekMsMEJBQTBCLEVBQUUsYUFBYTtvQkFDekMsMEJBQTBCLEVBQUUsYUFBYTtpQkFDMUM7Z0JBQ0QsZ0JBQWdCLEVB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T0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtZQUN6RCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxlQUFlLEVBQUU7Z0JBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYTtnQkFDekIsV0FBVyxFQUFFLDBCQUEwQixJQUFJLEVBQUU7Z0JBQzdDLFVBQVUsRUFBRSxVQUFVLFdBQVcsUUFBUSxJQUFJLEVBQUU7YUFDaEQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sbUJBQW1CLENBQUMsSUFBWSxFQUFFLFdBQW1CO1FBQzNELE9BQU8sSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksWUFBWSxFQUFFO1lBQ25ELGNBQWMsRUFBRSxlQUFlLElBQUksRUFBRTtZQUNyQyxlQUFlLEVBQUUsSUFBSTtZQUNyQixrQkFBa0IsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDN0MsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsV0FBVyxFQUFFLHFCQUFxQjtvQkFDbEMsYUFBYSxFQUFFLEVBQUU7b0JBQ2pCLFlBQVksRUFBRSxDQUFDO29CQUNmLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUc7aUJBQzdCO2FBQ0Y7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0ZkQsMENBc2ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIGFjbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1vc2FpY0xpZmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBjb25maWc6IHtcbiAgICBkb21haW5OYW1lOiBzdHJpbmc7XG4gICAgaG9zdGVkWm9uZUlkPzogc3RyaW5nO1xuICAgIGVudmlyb25tZW50OiBzdHJpbmc7XG4gICAgdnBjSWQ/OiBzdHJpbmc7IC8vIE9wdGlvbmFsOiB1c2UgZXhpc3RpbmcgVlBDIGluc3RlYWQgb2YgY3JlYXRpbmcgbmV3IG9uZVxuICAgIGV4aXN0aW5nVXNlclBvb2xJZD86IHN0cmluZzsgLy8gT3B0aW9uYWw6IGltcG9ydCBleGlzdGluZyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGV4aXN0aW5nRWNyUmVwb3M/OiBib29sZWFuOyAvLyBJZiB0cnVlLCBpbXBvcnQgZXhpc3RpbmcgRUNSIHJlcG9zaXRvcmllc1xuICAgIGV4aXN0aW5nUzNCdWNrZXRzPzogYm9vbGVhbjsgLy8gSWYgdHJ1ZSwgaW1wb3J0IGV4aXN0aW5nIFMzIGJ1Y2tldHNcbiAgICB0YWdzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuICB9O1xufVxuXG5leHBvcnQgY2xhc3MgTW9zYWljTGlmZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG4gIHB1YmxpYyByZWFkb25seSBob3N0ZWRab25lOiByb3V0ZTUzLklIb3N0ZWRab25lO1xuICBwdWJsaWMgcmVhZG9ubHkgY2VydGlmaWNhdGU6IGFjbS5DZXJ0aWZpY2F0ZTtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLklVc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgbWVkaWFCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSByZXBvc2l0b3JpZXM6IHsgW2tleTogc3RyaW5nXTogZWNyLklSZXBvc2l0b3J5IH07XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE1vc2FpY0xpZmVTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGRvbWFpbk5hbWUsIGhvc3RlZFpvbmVJZCwgZW52aXJvbm1lbnQsIHZwY0lkLCBleGlzdGluZ1VzZXJQb29sSWQsIGV4aXN0aW5nRWNyUmVwb3MsIGV4aXN0aW5nUzNCdWNrZXRzIH0gPSBwcm9wcy5jb25maWc7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBWUEMgZm9yIEVLU1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGlmICh2cGNJZCkge1xuICAgICAgLy8gVXNlIGV4aXN0aW5nIFZQQyBmcm9tIGluZnJhc3RydWN0dXJlIHN0YWNrXG4gICAgICB0aGlzLnZwYyA9IGVjMi5WcGMuZnJvbVZwY0F0dHJpYnV0ZXModGhpcywgJ01vc2FpY1ZQQycsIHtcbiAgICAgICAgdnBjSWQsXG4gICAgICAgIHZwY0NpZHJCbG9jazogJzEwLjAuMC4wLzE2JywgLy8gQ0lEUiBibG9jayBvZiB0aGUgZXhpc3RpbmcgVlBDXG4gICAgICAgIGF2YWlsYWJpbGl0eVpvbmVzOiBbJ3VzLWVhc3QtMWEnLCAndXMtZWFzdC0xYicsICd1cy1lYXN0LTFjJ10sXG4gICAgICAgIHB1YmxpY1N1Ym5ldElkczogW1xuICAgICAgICAgICdzdWJuZXQtMGQxZDI0NjcwYzIyZDBhMjQnLCAvLyB1cy1lYXN0LTFhXG4gICAgICAgICAgJ3N1Ym5ldC0wODI4NjM5YTYyYjU4MDkzNicsIC8vIHVzLWVhc3QtMWJcbiAgICAgICAgICAnc3VibmV0LTBlNGVjNGIwNDJkYWE2NzE4JywgLy8gdXMtZWFzdC0xY1xuICAgICAgICBdLFxuICAgICAgICBwcml2YXRlU3VibmV0SWRzOiBbXG4gICAgICAgICAgJ3N1Ym5ldC0wN2E2MWM5N2UyZTE2ZDkxYicsIC8vIHVzLWVhc3QtMWFcbiAgICAgICAgICAnc3VibmV0LTA3OWRkMGQ3YmU0MWU5NmE1JywgLy8gdXMtZWFzdC0xYlxuICAgICAgICAgICdzdWJuZXQtMDFlNjgyM2VkZGQ0YTlhOTQnLCAvLyB1cy1lYXN0LTFjXG4gICAgICAgIF0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyBWUEMgKG9ubHkgaWYgbm8gZXhpc3RpbmcgVlBDIHByb3ZpZGVkKVxuICAgICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnTW9zYWljVlBDJywge1xuICAgICAgICB2cGNOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXZwY2AsXG4gICAgICAgIG1heEF6czogMyxcbiAgICAgICAgbmF0R2F0ZXdheXM6IDIsIC8vIEhpZ2ggYXZhaWxhYmlsaXR5XG4gICAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdQcml2YXRlJyxcbiAgICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgICAgICBjaWRyTWFzazogMjAsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgZW5hYmxlRG5zSG9zdG5hbWVzOiB0cnVlLFxuICAgICAgICBlbmFibGVEbnNTdXBwb3J0OiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFRhZyBzdWJuZXRzIGZvciBFS1MgKG9ubHkgZm9yIG5ldyBWUEMpXG4gICAgICBjZGsuVGFncy5vZih0aGlzLnZwYykuYWRkKCdrdWJlcm5ldGVzLmlvL2NsdXN0ZXIvbW9zYWljLWxpZmUnLCAnc2hhcmVkJyk7XG5cbiAgICAgIHRoaXMudnBjLnB1YmxpY1N1Ym5ldHMuZm9yRWFjaCgoc3VibmV0LCBpbmRleCkgPT4ge1xuICAgICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgna3ViZXJuZXRlcy5pby9yb2xlL2VsYicsICcxJyk7XG4gICAgICAgIGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdOYW1lJywgYG1vc2FpYy0ke2Vudmlyb25tZW50fS1wdWJsaWMtJHtpbmRleCArIDF9YCk7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy52cGMucHJpdmF0ZVN1Ym5ldHMuZm9yRWFjaCgoc3VibmV0LCBpbmRleCkgPT4ge1xuICAgICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgna3ViZXJuZXRlcy5pby9yb2xlL2ludGVybmFsLWVsYicsICcxJyk7XG4gICAgICAgIGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdOYW1lJywgYG1vc2FpYy0ke2Vudmlyb25tZW50fS1wcml2YXRlLSR7aW5kZXggKyAxfWApO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZQQyBFbmRwb2ludHMgZm9yIEFXUyBzZXJ2aWNlcyB0byByZWR1Y2UgTkFUIGNvc3RzIChvbmx5IGZvciBuZXcgVlBDKVxuICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNNYW5hZ2VyRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU0VDUkVUU19NQU5BR0VSLFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdFQ1JBcGlFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQ1IsXG4gICAgICB9KTtcblxuICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ0VDUkRvY2tlckVuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkVDUl9ET0NLRVIsXG4gICAgICB9KTtcblxuICAgICAgdGhpcy52cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdTM0VuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5TMyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFJvdXRlNTMgSG9zdGVkIFpvbmVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBpZiAoaG9zdGVkWm9uZUlkKSB7XG4gICAgICAvLyBVc2UgZXhpc3RpbmcgaG9zdGVkIHpvbmVcbiAgICAgIHRoaXMuaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIGhvc3RlZFpvbmVJZCxcbiAgICAgICAgem9uZU5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyBob3N0ZWQgem9uZVxuICAgICAgdGhpcy5ob3N0ZWRab25lID0gbmV3IHJvdXRlNTMuUHVibGljSG9zdGVkWm9uZSh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgICAgem9uZU5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICAgIGNvbW1lbnQ6IGBIb3N0ZWQgem9uZSBmb3IgJHtkb21haW5OYW1lfWAsXG4gICAgICB9KTtcblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ05hbWVTZXJ2ZXJzJywge1xuICAgICAgICB2YWx1ZTogY2RrLkZuLmpvaW4oJywgJywgdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVOYW1lU2VydmVycyB8fCBbXSksXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVXBkYXRlIHlvdXIgZG9tYWluIHJlZ2lzdHJhciB3aXRoIHRoZXNlIG5hbWUgc2VydmVycycsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBBQ00gQ2VydGlmaWNhdGUgd2l0aCBTQU5zXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdGhpcy5jZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ0NlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZSxcbiAgICAgIHN1YmplY3RBbHRlcm5hdGl2ZU5hbWVzOiBbXG4gICAgICAgIGAqLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICBgZnJvbnRlbmQuJHtkb21haW5OYW1lfWAsXG4gICAgICAgIGBiYWNrZW5kLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICBgZ3JhcGguJHtkb21haW5OYW1lfWAsXG4gICAgICAgIGBjaGF0LiR7ZG9tYWluTmFtZX1gLFxuICAgICAgXSxcbiAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyh0aGlzLmhvc3RlZFpvbmUpLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgd2l0aCBTb2NpYWwgTG9naW5zXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgaWYgKGV4aXN0aW5nVXNlclBvb2xJZCkge1xuICAgICAgLy8gSW1wb3J0IGV4aXN0aW5nIFVzZXIgUG9vbFxuICAgICAgdGhpcy51c2VyUG9vbCA9IGNvZ25pdG8uVXNlclBvb2wuZnJvbVVzZXJQb29sSWQodGhpcywgJ1VzZXJQb29sJywgZXhpc3RpbmdVc2VyUG9vbElkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyBVc2VyIFBvb2xcbiAgICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVXNlclBvb2wnLCB7XG4gICAgICAgIHVzZXJQb29sTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS11c2Vyc2AsXG4gICAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgICAvLyBOb3RlOiBjdXN0b20gYXR0cmlidXRlIG5hbWVzIG11c3QgYmUgPD0gMjAgY2hhcnNcbiAgICAgICAgICAvLyBUaGlzIHdpbGwgYXBwZWFyIGFzIFwiY3VzdG9tOnJlbGF0aW9uc2hpcFwiIGluIHRva2Vuc1xuICAgICAgICAgIHJlbGF0aW9uc2hpcDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDEyLFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDMpLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgbWZhOiBjb2duaXRvLk1mYS5PUFRJT05BTCxcbiAgICAgIG1mYVNlY29uZEZhY3Rvcjoge1xuICAgICAgICBzbXM6IHRydWUsXG4gICAgICAgIG90cDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICAvLyBOb3RlOiBhZHZhbmNlZFNlY3VyaXR5TW9kZSByZW1vdmVkIC0gcmVxdWlyZXMgQ29nbml0byBQbHVzIHBsYW5cbiAgICAgIC8vIEZvciBiYXNpYyBzZWN1cml0eSwgQ29nbml0byBwcm92aWRlcyBzdGFuZGFyZCBwcm90ZWN0aW9ucyBieSBkZWZhdWx0XG4gICAgfSk7XG4gICAgfVxuXG4gICAgLy8gVXNlciBQb29sIERvbWFpbiBmb3IgQ29nbml0byBob3N0ZWQgVUlcbiAgICBjb25zdCB1c2VyUG9vbERvbWFpbiA9IHRoaXMudXNlclBvb2wuYWRkRG9tYWluKCdDb2duaXRvRG9tYWluJywge1xuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBcHAgQ2xpZW50IGZvciBPSURDIGZsb3dcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gdGhpcy51c2VyUG9vbC5hZGRDbGllbnQoJ1dlYkFwcENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ21vc2FpYy13ZWItY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiB0cnVlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgIGBodHRwczovLyR7ZG9tYWluTmFtZX0vYXV0aC9jYWxsYmFja2AsXG4gICAgICAgICAgYGh0dHBzOi8vZnJvbnRlbmQuJHtkb21haW5OYW1lfS9hdXRoL2NhbGxiYWNrYCxcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDo1MTczL2F1dGgvY2FsbGJhY2snLCAvLyBEZXZcbiAgICAgICAgXSxcbiAgICAgICAgbG9nb3V0VXJsczogW1xuICAgICAgICAgIGBodHRwczovLyR7ZG9tYWluTmFtZX1gLFxuICAgICAgICAgIGBodHRwczovL2Zyb250ZW5kLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjUxNzMnLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgICAgIC8vIFNvY2lhbCBwcm92aWRlcnMgd2lsbCBiZSBhZGRlZCBhZnRlciBjb25maWd1cmF0aW9uXG4gICAgICBdLFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgICBlbmFibGVUb2tlblJldm9jYXRpb246IHRydWUsXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24ubWludXRlcyg2MCksXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICAgIHJlZnJlc2hUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgfSk7XG5cbiAgICAvLyBHb29nbGUgSWRlbnRpdHkgUHJvdmlkZXIgKHJlcXVpcmVzIG1hbnVhbCBjb25maWd1cmF0aW9uKVxuICAgIGNvbnN0IGdvb2dsZVByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsICdHb29nbGVQcm92aWRlcicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY2xpZW50SWQ6IHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfSUQgfHwgJ1JFUExBQ0VfV0lUSF9HT09HTEVfQ0xJRU5UX0lEJyxcbiAgICAgIGNsaWVudFNlY3JldFZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KFxuICAgICAgICBwcm9jZXNzLmVudi5HT09HTEVfQ0xJRU5UX1NFQ1JFVCB8fCAnUkVQTEFDRV9XSVRIX0dPT0dMRV9DTElFTlRfU0VDUkVUJ1xuICAgICAgKSxcbiAgICAgIHNjb3BlczogWydwcm9maWxlJywgJ2VtYWlsJywgJ29wZW5pZCddLFxuICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRU1BSUwsXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcbiAgICAgICAgZmFtaWx5TmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRkFNSUxZX05BTUUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIElkZW50aXR5IFByb3ZpZGVyIChyZXF1aXJlcyBtYW51YWwgY29uZmlndXJhdGlvbilcbiAgICBjb25zdCBnaXRodWJQcm92aWRlciA9IG5ldyBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlck9pZGModGhpcywgJ0dpdEh1YlByb3ZpZGVyJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBuYW1lOiAnR2l0SHViJyxcbiAgICAgIGNsaWVudElkOiBwcm9jZXNzLmVudi5HSVRIVUJfQ0xJRU5UX0lEIHx8ICdSRVBMQUNFX1dJVEhfR0lUSFVCX0NMSUVOVF9JRCcsXG4gICAgICBjbGllbnRTZWNyZXQ6IHByb2Nlc3MuZW52LkdJVEhVQl9DTElFTlRfU0VDUkVUIHx8ICdSRVBMQUNFX1dJVEhfR0lUSFVCX0NMSUVOVF9TRUNSRVQnLFxuICAgICAgaXNzdWVyVXJsOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gICAgICBzY29wZXM6IFsnb3BlbmlkJywgJ2VtYWlsJywgJ3Byb2ZpbGUnXSxcbiAgICAgIGF0dHJpYnV0ZU1hcHBpbmc6IHtcbiAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUub3RoZXIoJ2VtYWlsJyksXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5vdGhlcignbmFtZScpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIENvZ25pdG8gY29uZmlndXJhdGlvbiBpbiBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBjb2duaXRvU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQ29nbml0b0NvbmZpZycsIHtcbiAgICAgIHNlY3JldE5hbWU6IGBtb3NhaWMvJHtlbnZpcm9ubWVudH0vY29nbml0by1jb25maWdgLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIGNvbmZpZ3VyYXRpb24gZm9yIE1vc2FpYyBMaWZlJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIHVzZXJQb29sSWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQodGhpcy51c2VyUG9vbC51c2VyUG9vbElkKSxcbiAgICAgICAgdXNlclBvb2xDbGllbnRJZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQpLFxuICAgICAgICB1c2VyUG9vbERvbWFpbjogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lKSxcbiAgICAgICAgcmVnaW9uOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHRoaXMucmVnaW9uKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTMyBCdWNrZXRzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gTWVkaWEgc3RvcmFnZSBidWNrZXRcbiAgICBpZiAoZXhpc3RpbmdTM0J1Y2tldHMpIHtcbiAgICAgIC8vIEltcG9ydCBleGlzdGluZyBidWNrZXRcbiAgICAgIHRoaXMubWVkaWFCdWNrZXQgPSBzMy5CdWNrZXQuZnJvbUJ1Y2tldE5hbWUodGhpcywgJ01lZGlhQnVja2V0JywgYG1vc2FpYy0ke2Vudmlyb25tZW50fS1tZWRpYS0ke3RoaXMuYWNjb3VudH1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyBidWNrZXRcbiAgICAgIHRoaXMubWVkaWFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdNZWRpYUJ1Y2tldCcsIHtcbiAgICAgICAgYnVja2V0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1tZWRpYS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiAnVHJhbnNpdGlvblRvSUEnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuR0xBQ0lFUl9JTlNUQU5UX1JFVFJJRVZBTCxcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxODApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRWZXJzaW9ucycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkRFTEVURSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgICAgIGBodHRwczovLyouJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDo1MTczJyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICBleHBvc2VkSGVhZGVyczogWydFVGFnJ10sXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBCYWNrdXAgYnVja2V0XG4gICAgbGV0IGJhY2t1cEJ1Y2tldDogczMuSUJ1Y2tldDtcbiAgICBpZiAoZXhpc3RpbmdTM0J1Y2tldHMpIHtcbiAgICAgIGJhY2t1cEJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnQmFja3VwQnVja2V0JywgYG1vc2FpYy0ke2Vudmlyb25tZW50fS1iYWNrdXBzLSR7dGhpcy5hY2NvdW50fWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBiYWNrdXBCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCYWNrdXBCdWNrZXQnLCB7XG4gICAgICAgIGJ1Y2tldE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tYmFja3Vwcy0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICBpZDogJ0FyY2hpdmVPbGRCYWNrdXBzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLkdMQUNJRVIsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gRUNSIFJlcG9zaXRvcmllc1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGlmIChleGlzdGluZ0VjclJlcG9zKSB7XG4gICAgICAvLyBJbXBvcnQgZXhpc3RpbmcgRUNSIHJlcG9zaXRvcmllc1xuICAgICAgdGhpcy5yZXBvc2l0b3JpZXMgPSB7XG4gICAgICAgIHdlYjogZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlOYW1lKHRoaXMsICd3ZWJSZXBvc2l0b3J5JywgJ21vc2FpYy1saWZlL3dlYicpLFxuICAgICAgICBjb3JlQXBpOiBlY3IuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeU5hbWUodGhpcywgJ2NvcmVBcGlSZXBvc2l0b3J5JywgJ21vc2FpYy1saWZlL2NvcmUtYXBpJyksXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IEVDUiByZXBvc2l0b3JpZXNcbiAgICAgIHRoaXMucmVwb3NpdG9yaWVzID0ge1xuICAgICAgICB3ZWI6IHRoaXMuY3JlYXRlRWNyUmVwb3NpdG9yeSgnd2ViJywgJ0Zyb250ZW5kIHdlYiBhcHBsaWNhdGlvbicpLFxuICAgICAgICBjb3JlQXBpOiB0aGlzLmNyZWF0ZUVjclJlcG9zaXRvcnkoJ2NvcmUtYXBpJywgJ0NvcmUgYmFja2VuZCBBUEknKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU05TL1NRUyBmb3IgRXZlbnQtRHJpdmVuIEFyY2hpdGVjdHVyZVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGRvbWFpbkV2ZW50c1RvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnRG9tYWluRXZlbnRzVG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZG9tYWluLWV2ZW50c2AsXG4gICAgICBkaXNwbGF5TmFtZTogJ01vc2FpYyBMaWZlIERvbWFpbiBFdmVudHMnLFxuICAgIH0pO1xuXG4gICAgLy8gRGVhZCBsZXR0ZXIgcXVldWUgZm9yIGZhaWxlZCBldmVudCBwcm9jZXNzaW5nXG4gICAgY29uc3QgZXZlbnRzRGxxID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRXZlbnRzRExRJywge1xuICAgICAgcXVldWVOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWV2ZW50cy1kbHFgLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgfSk7XG5cbiAgICAvLyBFdmVudHMgcXVldWUgZm9yIHByb2Nlc3NpbmdcbiAgICBjb25zdCBldmVudHNRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0V2ZW50c1F1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWV2ZW50c2AsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogZXZlbnRzRGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgZG9tYWluRXZlbnRzVG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgbmV3IGNkay5hd3Nfc25zX3N1YnNjcmlwdGlvbnMuU3FzU3Vic2NyaXB0aW9uKGV2ZW50c1F1ZXVlKVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBJQU0gUm9sZXMgZm9yIEVLUyBJUlNBXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb2xlIGZvciBjb3JlLWFwaSB0byBhY2Nlc3MgUzMsIFNlY3JldHMgTWFuYWdlciwgU1FTL1NOU1xuICAgIGNvbnN0IGNvcmVBcGlSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb3JlQXBpUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWNvcmUtYXBpLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgICBgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpvaWRjLXByb3ZpZGVyL29pZGMuZWtzLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vaWQvQ0xVU1RFUl9JRGAsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdvaWRjLmVrcy4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL2lkL0NMVVNURVJfSUQ6c3ViJzpcbiAgICAgICAgICAgICAgJ3N5c3RlbTpzZXJ2aWNlYWNjb3VudDptb3NhaWNsaWZlOmNvcmUtYXBpJyxcbiAgICAgICAgICAgICdvaWRjLmVrcy4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL2lkL0NMVVNURVJfSUQ6YXVkJzogJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICApLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgY29yZS1hcGkgc2VydmljZSBpbiBFS1MnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgdG8gY29yZS1hcGkgcm9sZVxuICAgIHRoaXMubWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoY29yZUFwaVJvbGUpO1xuICAgIGJhY2t1cEJ1Y2tldC5ncmFudFJlYWRXcml0ZShjb3JlQXBpUm9sZSk7XG4gICAgY29nbml0b1NlY3JldC5ncmFudFJlYWQoY29yZUFwaVJvbGUpO1xuICAgIGRvbWFpbkV2ZW50c1RvcGljLmdyYW50UHVibGlzaChjb3JlQXBpUm9sZSk7XG4gICAgZXZlbnRzUXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXMoY29yZUFwaVJvbGUpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gT3V0cHV0c1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVlBDIElEIGZvciBFS1MgY2x1c3RlcicsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXZwYy1pZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2VydGlmaWNhdGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5jZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQUNNIENlcnRpZmljYXRlIEFSTiBmb3IgQUxCJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tY2VydGlmaWNhdGUtYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS11c2VyLXBvb2wtaWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01lZGlhQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBmb3IgbWVkaWEgc3RvcmFnZScsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LW1lZGlhLWJ1Y2tldGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRG9tYWluRXZlbnRzVG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogZG9tYWluRXZlbnRzVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBmb3IgZG9tYWluIGV2ZW50cycsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWRvbWFpbi1ldmVudHMtdG9waWNgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0hvc3RlZFpvbmVJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdSb3V0ZTUzIEhvc3RlZCBab25lIElEJyxcbiAgICB9KTtcblxuICAgIE9iamVjdC5lbnRyaWVzKHRoaXMucmVwb3NpdG9yaWVzKS5mb3JFYWNoKChbbmFtZSwgcmVwb10pID0+IHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIGAke25hbWV9UmVwb3NpdG9yeVVyaWAsIHtcbiAgICAgICAgdmFsdWU6IHJlcG8ucmVwb3NpdG9yeVVyaSxcbiAgICAgICAgZGVzY3JpcHRpb246IGBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yICR7bmFtZX1gLFxuICAgICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWVjci0ke25hbWV9YCxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFY3JSZXBvc2l0b3J5KG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IGVjci5SZXBvc2l0b3J5IHtcbiAgICByZXR1cm4gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsIGAke25hbWV9UmVwb3NpdG9yeWAsIHtcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiBgbW9zYWljLWxpZmUvJHtuYW1lfWAsXG4gICAgICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgICBpbWFnZVRhZ011dGFiaWxpdHk6IGVjci5UYWdNdXRhYmlsaXR5Lk1VVEFCTEUsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdLZWVwIGxhc3QgMTAgaW1hZ2VzJyxcbiAgICAgICAgICBtYXhJbWFnZUNvdW50OiAxMCxcbiAgICAgICAgICBydWxlUHJpb3JpdHk6IDEsXG4gICAgICAgICAgdGFnU3RhdHVzOiBlY3IuVGFnU3RhdHVzLkFOWSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==