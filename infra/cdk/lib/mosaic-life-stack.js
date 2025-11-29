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
                vpcCidrBlock: '10.20.0.0/16', // CIDR block of the existing VPC (from infrastructure stack)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxpRUFBbUQ7QUFDbkQsd0VBQTBEO0FBQzFELGlFQUFtRDtBQUNuRCx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLCtFQUFpRTtBQUNqRSx5REFBMkM7QUFDM0MseURBQTJDO0FBZ0IzQyxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFTNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUUvSCwrREFBK0Q7UUFDL0QsY0FBYztRQUNkLCtEQUErRDtRQUMvRCxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1YsNkNBQTZDO1lBQzdDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFO2dCQUN0RCxLQUFLO2dCQUNMLFlBQVksRUFBRSxjQUFjLEVBQUUsNkRBQTZEO2dCQUMzRixpQkFBaUIsRUFBRSxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDO2dCQUM3RCxlQUFlLEVBQUU7b0JBQ2YsMEJBQTBCLEVBQUUsYUFBYTtvQkFDekMsMEJBQTBCLEVBQUUsYUFBYTtvQkFDekMsMEJBQTBCLEVBQUUsYUFBYTtpQkFDMUM7Z0JBQ0QsZ0JBQWdCLEVB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T0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtZQUN6RCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxlQUFlLEVBQUU7Z0JBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYTtnQkFDekIsV0FBVyxFQUFFLDBCQUEwQixJQUFJLEVBQUU7Z0JBQzdDLFVBQVUsRUFBRSxVQUFVLFdBQVcsUUFBUSxJQUFJLEVBQUU7YUFDaEQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sbUJBQW1CLENBQUMsSUFBWSxFQUFFLFdBQW1CO1FBQzNELE9BQU8sSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksWUFBWSxFQUFFO1lBQ25ELGNBQWMsRUFBRSxlQUFlLElBQUksRUFBRTtZQUNyQyxlQUFlLEVBQUUsSUFBSTtZQUNyQixrQkFBa0IsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDN0MsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsV0FBVyxFQUFFLHFCQUFxQjtvQkFDbEMsYUFBYSxFQUFFLEVBQUU7b0JBQ2pCLFlBQVksRUFBRSxDQUFDO29CQUNmLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUc7aUJBQzdCO2FBQ0Y7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0ZkQsMENBc2ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIGFjbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1vc2FpY0xpZmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBjb25maWc6IHtcbiAgICBkb21haW5OYW1lOiBzdHJpbmc7XG4gICAgaG9zdGVkWm9uZUlkPzogc3RyaW5nO1xuICAgIGVudmlyb25tZW50OiBzdHJpbmc7XG4gICAgdnBjSWQ/OiBzdHJpbmc7IC8vIE9wdGlvbmFsOiB1c2UgZXhpc3RpbmcgVlBDIGluc3RlYWQgb2YgY3JlYXRpbmcgbmV3IG9uZVxuICAgIGV4aXN0aW5nVXNlclBvb2xJZD86IHN0cmluZzsgLy8gT3B0aW9uYWw6IGltcG9ydCBleGlzdGluZyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGV4aXN0aW5nRWNyUmVwb3M/OiBib29sZWFuOyAvLyBJZiB0cnVlLCBpbXBvcnQgZXhpc3RpbmcgRUNSIHJlcG9zaXRvcmllc1xuICAgIGV4aXN0aW5nUzNCdWNrZXRzPzogYm9vbGVhbjsgLy8gSWYgdHJ1ZSwgaW1wb3J0IGV4aXN0aW5nIFMzIGJ1Y2tldHNcbiAgICB0YWdzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuICB9O1xufVxuXG5leHBvcnQgY2xhc3MgTW9zYWljTGlmZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG4gIHB1YmxpYyByZWFkb25seSBob3N0ZWRab25lOiByb3V0ZTUzLklIb3N0ZWRab25lO1xuICBwdWJsaWMgcmVhZG9ubHkgY2VydGlmaWNhdGU6IGFjbS5DZXJ0aWZpY2F0ZTtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLklVc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgbWVkaWFCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSByZXBvc2l0b3JpZXM6IHsgW2tleTogc3RyaW5nXTogZWNyLklSZXBvc2l0b3J5IH07XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE1vc2FpY0xpZmVTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGRvbWFpbk5hbWUsIGhvc3RlZFpvbmVJZCwgZW52aXJvbm1lbnQsIHZwY0lkLCBleGlzdGluZ1VzZXJQb29sSWQsIGV4aXN0aW5nRWNyUmVwb3MsIGV4aXN0aW5nUzNCdWNrZXRzIH0gPSBwcm9wcy5jb25maWc7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBWUEMgZm9yIEVLU1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGlmICh2cGNJZCkge1xuICAgICAgLy8gVXNlIGV4aXN0aW5nIFZQQyBmcm9tIGluZnJhc3RydWN0dXJlIHN0YWNrXG4gICAgICB0aGlzLnZwYyA9IGVjMi5WcGMuZnJvbVZwY0F0dHJpYnV0ZXModGhpcywgJ01vc2FpY1ZQQycsIHtcbiAgICAgICAgdnBjSWQsXG4gICAgICAgIHZwY0NpZHJCbG9jazogJzEwLjIwLjAuMC8xNicsIC8vIENJRFIgYmxvY2sgb2YgdGhlIGV4aXN0aW5nIFZQQyAoZnJvbSBpbmZyYXN0cnVjdHVyZSBzdGFjaylcbiAgICAgICAgYXZhaWxhYmlsaXR5Wm9uZXM6IFsndXMtZWFzdC0xYScsICd1cy1lYXN0LTFiJywgJ3VzLWVhc3QtMWMnXSxcbiAgICAgICAgcHVibGljU3VibmV0SWRzOiBbXG4gICAgICAgICAgJ3N1Ym5ldC0wZDFkMjQ2NzBjMjJkMGEyNCcsIC8vIHVzLWVhc3QtMWFcbiAgICAgICAgICAnc3VibmV0LTA4Mjg2MzlhNjJiNTgwOTM2JywgLy8gdXMtZWFzdC0xYlxuICAgICAgICAgICdzdWJuZXQtMGU0ZWM0YjA0MmRhYTY3MTgnLCAvLyB1cy1lYXN0LTFjXG4gICAgICAgIF0sXG4gICAgICAgIHByaXZhdGVTdWJuZXRJZHM6IFtcbiAgICAgICAgICAnc3VibmV0LTA3YTYxYzk3ZTJlMTZkOTFiJywgLy8gdXMtZWFzdC0xYVxuICAgICAgICAgICdzdWJuZXQtMDc5ZGQwZDdiZTQxZTk2YTUnLCAvLyB1cy1lYXN0LTFiXG4gICAgICAgICAgJ3N1Ym5ldC0wMWU2ODIzZWRkZDRhOWE5NCcsIC8vIHVzLWVhc3QtMWNcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IFZQQyAob25seSBpZiBubyBleGlzdGluZyBWUEMgcHJvdmlkZWQpXG4gICAgICB0aGlzLnZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdNb3NhaWNWUEMnLCB7XG4gICAgICAgIHZwY05hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tdnBjYCxcbiAgICAgICAgbWF4QXpzOiAzLFxuICAgICAgICBuYXRHYXRld2F5czogMiwgLy8gSGlnaCBhdmFpbGFiaWxpdHlcbiAgICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdQdWJsaWMnLFxuICAgICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ1ByaXZhdGUnLFxuICAgICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgICAgICAgIGNpZHJNYXNrOiAyMCxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBlbmFibGVEbnNIb3N0bmFtZXM6IHRydWUsXG4gICAgICAgIGVuYWJsZURuc1N1cHBvcnQ6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgLy8gVGFnIHN1Ym5ldHMgZm9yIEVLUyAob25seSBmb3IgbmV3IFZQQylcbiAgICAgIGNkay5UYWdzLm9mKHRoaXMudnBjKS5hZGQoJ2t1YmVybmV0ZXMuaW8vY2x1c3Rlci9tb3NhaWMtbGlmZScsICdzaGFyZWQnKTtcblxuICAgICAgdGhpcy52cGMucHVibGljU3VibmV0cy5mb3JFYWNoKChzdWJuZXQsIGluZGV4KSA9PiB7XG4gICAgICAgIGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdrdWJlcm5ldGVzLmlvL3JvbGUvZWxiJywgJzEnKTtcbiAgICAgICAgY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ05hbWUnLCBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXB1YmxpYy0ke2luZGV4ICsgMX1gKTtcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnZwYy5wcml2YXRlU3VibmV0cy5mb3JFYWNoKChzdWJuZXQsIGluZGV4KSA9PiB7XG4gICAgICAgIGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdrdWJlcm5ldGVzLmlvL3JvbGUvaW50ZXJuYWwtZWxiJywgJzEnKTtcbiAgICAgICAgY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ05hbWUnLCBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXByaXZhdGUtJHtpbmRleCArIDF9YCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gVlBDIEVuZHBvaW50cyBmb3IgQVdTIHNlcnZpY2VzIHRvIHJlZHVjZSBOQVQgY29zdHMgKG9ubHkgZm9yIG5ldyBWUEMpXG4gICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnU2VjcmV0c01hbmFnZXJFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgICB9KTtcblxuICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ0VDUkFwaUVuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkVDUixcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnRUNSRG9ja2VyRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNSX0RPQ0tFUixcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnZwYy5hZGRHYXRld2F5RW5kcG9pbnQoJ1MzRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gUm91dGU1MyBIb3N0ZWQgWm9uZVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGlmIChob3N0ZWRab25lSWQpIHtcbiAgICAgIC8vIFVzZSBleGlzdGluZyBob3N0ZWQgem9uZVxuICAgICAgdGhpcy5ob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgICAgaG9zdGVkWm9uZUlkLFxuICAgICAgICB6b25lTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IGhvc3RlZCB6b25lXG4gICAgICB0aGlzLmhvc3RlZFpvbmUgPSBuZXcgcm91dGU1My5QdWJsaWNIb3N0ZWRab25lKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICB6b25lTmFtZTogZG9tYWluTmFtZSxcbiAgICAgICAgY29tbWVudDogYEhvc3RlZCB6b25lIGZvciAke2RvbWFpbk5hbWV9YCxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTmFtZVNlcnZlcnMnLCB7XG4gICAgICAgIHZhbHVlOiBjZGsuRm4uam9pbignLCAnLCB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZU5hbWVTZXJ2ZXJzIHx8IFtdKSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdVcGRhdGUgeW91ciBkb21haW4gcmVnaXN0cmFyIHdpdGggdGhlc2UgbmFtZSBzZXJ2ZXJzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFDTSBDZXJ0aWZpY2F0ZSB3aXRoIFNBTnNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB0aGlzLmNlcnRpZmljYXRlID0gbmV3IGFjbS5DZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lLFxuICAgICAgc3ViamVjdEFsdGVybmF0aXZlTmFtZXM6IFtcbiAgICAgICAgYCouJHtkb21haW5OYW1lfWAsXG4gICAgICAgIGBmcm9udGVuZC4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgYGJhY2tlbmQuJHtkb21haW5OYW1lfWAsXG4gICAgICAgIGBncmFwaC4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgYGNoYXQuJHtkb21haW5OYW1lfWAsXG4gICAgICBdLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKHRoaXMuaG9zdGVkWm9uZSksXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCB3aXRoIFNvY2lhbCBMb2dpbnNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBpZiAoZXhpc3RpbmdVc2VyUG9vbElkKSB7XG4gICAgICAvLyBJbXBvcnQgZXhpc3RpbmcgVXNlciBQb29sXG4gICAgICB0aGlzLnVzZXJQb29sID0gY29nbml0by5Vc2VyUG9vbC5mcm9tVXNlclBvb2xJZCh0aGlzLCAnVXNlclBvb2wnLCBleGlzdGluZ1VzZXJQb29sSWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IFVzZXIgUG9vbFxuICAgICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdVc2VyUG9vbCcsIHtcbiAgICAgICAgdXNlclBvb2xOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXVzZXJzYCxcbiAgICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGdpdmVuTmFtZToge1xuICAgICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICAgIC8vIE5vdGU6IGN1c3RvbSBhdHRyaWJ1dGUgbmFtZXMgbXVzdCBiZSA8PSAyMCBjaGFyc1xuICAgICAgICAgIC8vIFRoaXMgd2lsbCBhcHBlYXIgYXMgXCJjdXN0b206cmVsYXRpb25zaGlwXCIgaW4gdG9rZW5zXG4gICAgICAgICAgcmVsYXRpb25zaGlwOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogMTIsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiB0cnVlLFxuICAgICAgICB0ZW1wUGFzc3dvcmRWYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoMyksXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9QVElPTkFMLFxuICAgICAgbWZhU2Vjb25kRmFjdG9yOiB7XG4gICAgICAgIHNtczogdHJ1ZSxcbiAgICAgICAgb3RwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIC8vIE5vdGU6IGFkdmFuY2VkU2VjdXJpdHlNb2RlIHJlbW92ZWQgLSByZXF1aXJlcyBDb2duaXRvIFBsdXMgcGxhblxuICAgICAgLy8gRm9yIGJhc2ljIHNlY3VyaXR5LCBDb2duaXRvIHByb3ZpZGVzIHN0YW5kYXJkIHByb3RlY3Rpb25zIGJ5IGRlZmF1bHRcbiAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBVc2VyIFBvb2wgRG9tYWluIGZvciBDb2duaXRvIGhvc3RlZCBVSVxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gdGhpcy51c2VyUG9vbC5hZGREb21haW4oJ0NvZ25pdG9Eb21haW4nLCB7XG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYG1vc2FpYy0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFwcCBDbGllbnQgZm9yIE9JREMgZmxvd1xuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSB0aGlzLnVzZXJQb29sLmFkZENsaWVudCgnV2ViQXBwQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAnbW9zYWljLXdlYi1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IHRydWUsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgICBjdXN0b206IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcbiAgICAgICAgXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtkb21haW5OYW1lfS9hdXRoL2NhbGxiYWNrYCxcbiAgICAgICAgICBgaHR0cHM6Ly9mcm9udGVuZC4ke2RvbWFpbk5hbWV9L2F1dGgvY2FsbGJhY2tgLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjUxNzMvYXV0aC9jYWxsYmFjaycsIC8vIERldlxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgYGh0dHBzOi8vZnJvbnRlbmQuJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgLy8gU29jaWFsIHByb3ZpZGVycyB3aWxsIGJlIGFkZGVkIGFmdGVyIGNvbmZpZ3VyYXRpb25cbiAgICAgIF0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIGVuYWJsZVRva2VuUmV2b2NhdGlvbjogdHJ1ZSxcbiAgICAgIGFjY2Vzc1Rva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICAgIGlkVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNjApLFxuICAgICAgcmVmcmVzaFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICB9KTtcblxuICAgIC8vIEdvb2dsZSBJZGVudGl0eSBQcm92aWRlciAocmVxdWlyZXMgbWFudWFsIGNvbmZpZ3VyYXRpb24pXG4gICAgY29uc3QgZ29vZ2xlUHJvdmlkZXIgPSBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjbGllbnRJZDogcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9JRCB8fCAnUkVQTEFDRV9XSVRIX0dPT0dMRV9DTElFTlRfSUQnLFxuICAgICAgY2xpZW50U2VjcmV0VmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoXG4gICAgICAgIHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfU0VDUkVUIHx8ICdSRVBMQUNFX1dJVEhfR09PR0xFX0NMSUVOVF9TRUNSRVQnXG4gICAgICApLFxuICAgICAgc2NvcGVzOiBbJ3Byb2ZpbGUnLCAnZW1haWwnLCAnb3BlbmlkJ10sXG4gICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9HSVZFTl9OQU1FLFxuICAgICAgICBmYW1pbHlOYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9GQU1JTFlfTkFNRSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgSWRlbnRpdHkgUHJvdmlkZXIgKHJlcXVpcmVzIG1hbnVhbCBjb25maWd1cmF0aW9uKVxuICAgIGNvbnN0IGdpdGh1YlByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyT2lkYyh0aGlzLCAnR2l0SHViUHJvdmlkZXInLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIG5hbWU6ICdHaXRIdWInLFxuICAgICAgY2xpZW50SWQ6IHByb2Nlc3MuZW52LkdJVEhVQl9DTElFTlRfSUQgfHwgJ1JFUExBQ0VfV0lUSF9HSVRIVUJfQ0xJRU5UX0lEJyxcbiAgICAgIGNsaWVudFNlY3JldDogcHJvY2Vzcy5lbnYuR0lUSFVCX0NMSUVOVF9TRUNSRVQgfHwgJ1JFUExBQ0VfV0lUSF9HSVRIVUJfQ0xJRU5UX1NFQ1JFVCcsXG4gICAgICBpc3N1ZXJVcmw6ICdodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tJyxcbiAgICAgIHNjb3BlczogWydvcGVuaWQnLCAnZW1haWwnLCAncHJvZmlsZSddLFxuICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5vdGhlcignZW1haWwnKSxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLm90aGVyKCduYW1lJyksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgQ29nbml0byBjb25maWd1cmF0aW9uIGluIFNlY3JldHMgTWFuYWdlclxuICAgIGNvbnN0IGNvZ25pdG9TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdDb2duaXRvQ29uZmlnJywge1xuICAgICAgc2VjcmV0TmFtZTogYG1vc2FpYy8ke2Vudmlyb25tZW50fS9jb2duaXRvLWNvbmZpZ2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gY29uZmlndXJhdGlvbiBmb3IgTW9zYWljIExpZmUnLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgdXNlclBvb2xJZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQpLFxuICAgICAgICB1c2VyUG9vbENsaWVudElkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCksXG4gICAgICAgIHVzZXJQb29sRG9tYWluOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUpLFxuICAgICAgICByZWdpb246IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQodGhpcy5yZWdpb24pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFMzIEJ1Y2tldHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBNZWRpYSBzdG9yYWdlIGJ1Y2tldFxuICAgIGlmIChleGlzdGluZ1MzQnVja2V0cykge1xuICAgICAgLy8gSW1wb3J0IGV4aXN0aW5nIGJ1Y2tldFxuICAgICAgdGhpcy5tZWRpYUJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnTWVkaWFCdWNrZXQnLCBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LW1lZGlhLSR7dGhpcy5hY2NvdW50fWApO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IGJ1Y2tldFxuICAgICAgdGhpcy5tZWRpYUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ01lZGlhQnVja2V0Jywge1xuICAgICAgICBidWNrZXROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LW1lZGlhLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6ICdUcmFuc2l0aW9uVG9JQScsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB0cmFuc2l0aW9uczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5JTkZSRVFVRU5UX0FDQ0VTUyxcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5HTEFDSUVSX0lOU1RBTlRfUkVUUklFVkFMLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDE4MCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5HRVQsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QVVQsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QT1NULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuREVMRVRFLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcbiAgICAgICAgICAgIGBodHRwczovLyR7ZG9tYWluTmFtZX1gLFxuICAgICAgICAgICAgYGh0dHBzOi8vKi4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjUxNzMnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIGV4cG9zZWRIZWFkZXJzOiBbJ0VUYWcnXSxcbiAgICAgICAgICBtYXhBZ2U6IDMwMDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEJhY2t1cCBidWNrZXRcbiAgICBsZXQgYmFja3VwQnVja2V0OiBzMy5JQnVja2V0O1xuICAgIGlmIChleGlzdGluZ1MzQnVja2V0cykge1xuICAgICAgYmFja3VwQnVja2V0ID0gczMuQnVja2V0LmZyb21CdWNrZXROYW1lKHRoaXMsICdCYWNrdXBCdWNrZXQnLCBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWJhY2t1cHMtJHt0aGlzLmFjY291bnR9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJhY2t1cEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0JhY2t1cEJ1Y2tldCcsIHtcbiAgICAgICAgYnVja2V0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1iYWNrdXBzLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgIGlkOiAnQXJjaGl2ZU9sZEJhY2t1cHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuR0xBQ0lFUixcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzY1KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBFQ1IgUmVwb3NpdG9yaWVzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgaWYgKGV4aXN0aW5nRWNyUmVwb3MpIHtcbiAgICAgIC8vIEltcG9ydCBleGlzdGluZyBFQ1IgcmVwb3NpdG9yaWVzXG4gICAgICB0aGlzLnJlcG9zaXRvcmllcyA9IHtcbiAgICAgICAgd2ViOiBlY3IuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeU5hbWUodGhpcywgJ3dlYlJlcG9zaXRvcnknLCAnbW9zYWljLWxpZmUvd2ViJyksXG4gICAgICAgIGNvcmVBcGk6IGVjci5SZXBvc2l0b3J5LmZyb21SZXBvc2l0b3J5TmFtZSh0aGlzLCAnY29yZUFwaVJlcG9zaXRvcnknLCAnbW9zYWljLWxpZmUvY29yZS1hcGknKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgRUNSIHJlcG9zaXRvcmllc1xuICAgICAgdGhpcy5yZXBvc2l0b3JpZXMgPSB7XG4gICAgICAgIHdlYjogdGhpcy5jcmVhdGVFY3JSZXBvc2l0b3J5KCd3ZWInLCAnRnJvbnRlbmQgd2ViIGFwcGxpY2F0aW9uJyksXG4gICAgICAgIGNvcmVBcGk6IHRoaXMuY3JlYXRlRWNyUmVwb3NpdG9yeSgnY29yZS1hcGknLCAnQ29yZSBiYWNrZW5kIEFQSScpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTTlMvU1FTIGZvciBFdmVudC1Ecml2ZW4gQXJjaGl0ZWN0dXJlXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgZG9tYWluRXZlbnRzVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdEb21haW5FdmVudHNUb3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1kb21haW4tZXZlbnRzYCxcbiAgICAgIGRpc3BsYXlOYW1lOiAnTW9zYWljIExpZmUgRG9tYWluIEV2ZW50cycsXG4gICAgfSk7XG5cbiAgICAvLyBEZWFkIGxldHRlciBxdWV1ZSBmb3IgZmFpbGVkIGV2ZW50IHByb2Nlc3NpbmdcbiAgICBjb25zdCBldmVudHNEbHEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdFdmVudHNETFEnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZXZlbnRzLWRscWAsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICB9KTtcblxuICAgIC8vIEV2ZW50cyBxdWV1ZSBmb3IgcHJvY2Vzc2luZ1xuICAgIGNvbnN0IGV2ZW50c1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRXZlbnRzUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZXZlbnRzYCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBldmVudHNEbHEsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBkb21haW5FdmVudHNUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgY2RrLmF3c19zbnNfc3Vic2NyaXB0aW9ucy5TcXNTdWJzY3JpcHRpb24oZXZlbnRzUXVldWUpXG4gICAgKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIElBTSBSb2xlcyBmb3IgRUtTIElSU0FcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvbGUgZm9yIGNvcmUtYXBpIHRvIGFjY2VzcyBTMywgU2VjcmV0cyBNYW5hZ2VyLCBTUVMvU05TXG4gICAgY29uc3QgY29yZUFwaVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvcmVBcGlSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tY29yZS1hcGktcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICAgIGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9Om9pZGMtcHJvdmlkZXIvb2lkYy5la3MuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS9pZC9DTFVTVEVSX0lEYCxcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ29pZGMuZWtzLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vaWQvQ0xVU1RFUl9JRDpzdWInOlxuICAgICAgICAgICAgICAnc3lzdGVtOnNlcnZpY2VhY2NvdW50Om1vc2FpY2xpZmU6Y29yZS1hcGknLFxuICAgICAgICAgICAgJ29pZGMuZWtzLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vaWQvQ0xVU1RFUl9JRDphdWQnOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIGZvciBjb3JlLWFwaSBzZXJ2aWNlIGluIEVLUycsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyB0byBjb3JlLWFwaSByb2xlXG4gICAgdGhpcy5tZWRpYUJ1Y2tldC5ncmFudFJlYWRXcml0ZShjb3JlQXBpUm9sZSk7XG4gICAgYmFja3VwQnVja2V0LmdyYW50UmVhZFdyaXRlKGNvcmVBcGlSb2xlKTtcbiAgICBjb2duaXRvU2VjcmV0LmdyYW50UmVhZChjb3JlQXBpUm9sZSk7XG4gICAgZG9tYWluRXZlbnRzVG9waWMuZ3JhbnRQdWJsaXNoKGNvcmVBcGlSb2xlKTtcbiAgICBldmVudHNRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhjb3JlQXBpUm9sZSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBPdXRwdXRzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZwY0lkJywge1xuICAgICAgdmFsdWU6IHRoaXMudnBjLnZwY0lkLFxuICAgICAgZGVzY3JpcHRpb246ICdWUEMgSUQgZm9yIEVLUyBjbHVzdGVyJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tdnBjLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDZXJ0aWZpY2F0ZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBQ00gQ2VydGlmaWNhdGUgQVJOIGZvciBBTEInLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1jZXJ0aWZpY2F0ZS1hcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXVzZXItcG9vbC1pZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXVzZXItcG9vbC1jbGllbnQtaWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIERvbWFpbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWVkaWFCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMubWVkaWFCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IGZvciBtZWRpYSBzdG9yYWdlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tbWVkaWEtYnVja2V0YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEb21haW5FdmVudHNUb3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiBkb21haW5FdmVudHNUb3BpYy50b3BpY0FybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU05TIHRvcGljIGZvciBkb21haW4gZXZlbnRzJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZG9tYWluLWV2ZW50cy10b3BpY2AsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSG9zdGVkWm9uZUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMuaG9zdGVkWm9uZS5ob3N0ZWRab25lSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvdXRlNTMgSG9zdGVkIFpvbmUgSUQnLFxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmVudHJpZXModGhpcy5yZXBvc2l0b3JpZXMpLmZvckVhY2goKFtuYW1lLCByZXBvXSkgPT4ge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgYCR7bmFtZX1SZXBvc2l0b3J5VXJpYCwge1xuICAgICAgICB2YWx1ZTogcmVwby5yZXBvc2l0b3J5VXJpLFxuICAgICAgICBkZXNjcmlwdGlvbjogYEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgJHtuYW1lfWAsXG4gICAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZWNyLSR7bmFtZX1gLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUVjclJlcG9zaXRvcnkobmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogZWNyLlJlcG9zaXRvcnkge1xuICAgIHJldHVybiBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgYCR7bmFtZX1SZXBvc2l0b3J5YCwge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6IGBtb3NhaWMtbGlmZS8ke25hbWV9YCxcbiAgICAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAgIGltYWdlVGFnTXV0YWJpbGl0eTogZWNyLlRhZ011dGFiaWxpdHkuTVVUQUJMRSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0tlZXAgbGFzdCAxMCBpbWFnZXMnLFxuICAgICAgICAgIG1heEltYWdlQ291bnQ6IDEwLFxuICAgICAgICAgIHJ1bGVQcmlvcml0eTogMSxcbiAgICAgICAgICB0YWdTdGF0dXM6IGVjci5UYWdTdGF0dXMuQU5ZLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxufVxuIl19