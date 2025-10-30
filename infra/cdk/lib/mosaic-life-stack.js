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
        const { domainName, hostedZoneId, environment, vpcId } = props.config;
        // ============================================================
        // VPC for EKS
        // ============================================================
        if (vpcId) {
            // Use existing VPC from infrastructure stack
            this.vpc = ec2.Vpc.fromVpcAttributes(this, 'MosaicVPC', {
                vpcId,
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
        // Backup bucket
        const backupBucket = new s3.Bucket(this, 'BackupBucket', {
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
        // ============================================================
        // ECR Repositories
        // ============================================================
        this.repositories = {
            web: this.createEcrRepository('web', 'Frontend web application'),
            coreApi: this.createEcrRepository('core-api', 'Core backend API'),
        };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxpRUFBbUQ7QUFDbkQsd0VBQTBEO0FBQzFELGlFQUFtRDtBQUNuRCx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLCtFQUFpRTtBQUNqRSx5REFBMkM7QUFDM0MseURBQTJDO0FBYTNDLE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQVM1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBRXRFLCtEQUErRDtRQUMvRCxjQUFjO1FBQ2QsK0RBQStEO1FBQy9ELElBQUksS0FBSyxFQUFFLENBQUM7WUFDViw2Q0FBNkM7WUFDN0MsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7Z0JBQ3RELEtBQUs7Z0JBQ0wsaUJBQWlCLEVBQUUsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFlBQVksQ0FBQztnQkFDN0QsZUFBZSxFQUFFO29CQUNmLDBCQUEwQixFQUFFLGFBQWE7b0JBQ3pDLDBCQUEwQixFQUFFLGFBQWE7b0JBQ3pDLDBCQUEwQixFQUFFLGFBQWE7aUJBQzFDO2dCQUNELGdCQUFnQixFQUFFO29CQUNoQiwwQkFBMEIsRUFBRSxhQUFhO29CQUN6QywwQkFBMEIsRUFBRSxhQUFhO29CQUN6QywwQkFBMEIsRUFBRSxh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R0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxJQUFJLGVBQWUsRUFBRTtnQkFDOUMsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhO2dCQUN6QixXQUFXLEVBQUUsMEJBQTBCLElBQUksRUFBRTtnQkFDN0MsVUFBVSxFQUFFLFVBQVUsV0FBVyxRQUFRLElBQUksRUFBRTthQUNoRCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxJQUFZLEVBQUUsV0FBbUI7UUFDM0QsT0FBTyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxZQUFZLEVBQUU7WUFDbkQsY0FBYyxFQUFFLGVBQWUsSUFBSSxFQUFFO1lBQ3JDLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLGtCQUFrQixFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUM3QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1lBQ3ZDLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxXQUFXLEVBQUUscUJBQXFCO29CQUNsQyxhQUFhLEVBQUUsRUFBRTtvQkFDakIsWUFBWSxFQUFFLENBQUM7b0JBQ2YsU0FBUyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRztpQkFDN0I7YUFDRjtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTNkRCwwQ0EyZEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9zYWljTGlmZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGNvbmZpZzoge1xuICAgIGRvbWFpbk5hbWU6IHN0cmluZztcbiAgICBob3N0ZWRab25lSWQ/OiBzdHJpbmc7XG4gICAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgICB2cGNJZD86IHN0cmluZzsgLy8gT3B0aW9uYWw6IHVzZSBleGlzdGluZyBWUEMgaW5zdGVhZCBvZiBjcmVhdGluZyBuZXcgb25lXG4gICAgdGFnczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgfTtcbn1cblxuZXhwb3J0IGNsYXNzIE1vc2FpY0xpZmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5JVnBjO1xuICBwdWJsaWMgcmVhZG9ubHkgaG9zdGVkWm9uZTogcm91dGU1My5JSG9zdGVkWm9uZTtcbiAgcHVibGljIHJlYWRvbmx5IGNlcnRpZmljYXRlOiBhY20uQ2VydGlmaWNhdGU7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgbWVkaWFCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IHJlcG9zaXRvcmllczogeyBba2V5OiBzdHJpbmddOiBlY3IuUmVwb3NpdG9yeSB9O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNb3NhaWNMaWZlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBkb21haW5OYW1lLCBob3N0ZWRab25lSWQsIGVudmlyb25tZW50LCB2cGNJZCB9ID0gcHJvcHMuY29uZmlnO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gVlBDIGZvciBFS1NcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBpZiAodnBjSWQpIHtcbiAgICAgIC8vIFVzZSBleGlzdGluZyBWUEMgZnJvbSBpbmZyYXN0cnVjdHVyZSBzdGFja1xuICAgICAgdGhpcy52cGMgPSBlYzIuVnBjLmZyb21WcGNBdHRyaWJ1dGVzKHRoaXMsICdNb3NhaWNWUEMnLCB7XG4gICAgICAgIHZwY0lkLFxuICAgICAgICBhdmFpbGFiaWxpdHlab25lczogWyd1cy1lYXN0LTFhJywgJ3VzLWVhc3QtMWInLCAndXMtZWFzdC0xYyddLFxuICAgICAgICBwdWJsaWNTdWJuZXRJZHM6IFtcbiAgICAgICAgICAnc3VibmV0LTBkMWQyNDY3MGMyMmQwYTI0JywgLy8gdXMtZWFzdC0xYVxuICAgICAgICAgICdzdWJuZXQtMDgyODYzOWE2MmI1ODA5MzYnLCAvLyB1cy1lYXN0LTFiXG4gICAgICAgICAgJ3N1Ym5ldC0wZTRlYzRiMDQyZGFhNjcxOCcsIC8vIHVzLWVhc3QtMWNcbiAgICAgICAgXSxcbiAgICAgICAgcHJpdmF0ZVN1Ym5ldElkczogW1xuICAgICAgICAgICdzdWJuZXQtMDdhNjFjOTdlMmUxNmQ5MWInLCAvLyB1cy1lYXN0LTFhXG4gICAgICAgICAgJ3N1Ym5ldC0wNzlkZDBkN2JlNDFlOTZhNScsIC8vIHVzLWVhc3QtMWJcbiAgICAgICAgICAnc3VibmV0LTAxZTY4MjNlZGRkNGE5YTk0JywgLy8gdXMtZWFzdC0xY1xuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgVlBDIChvbmx5IGlmIG5vIGV4aXN0aW5nIFZQQyBwcm92aWRlZClcbiAgICAgIHRoaXMudnBjID0gbmV3IGVjMi5WcGModGhpcywgJ01vc2FpY1ZQQycsIHtcbiAgICAgICAgdnBjTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS12cGNgLFxuICAgICAgICBtYXhBenM6IDMsXG4gICAgICAgIG5hdEdhdGV3YXlzOiAyLCAvLyBIaWdoIGF2YWlsYWJpbGl0eVxuICAgICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ1B1YmxpYycsXG4gICAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnUHJpdmF0ZScsXG4gICAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgICAgICAgY2lkck1hc2s6IDIwLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGVuYWJsZURuc0hvc3RuYW1lczogdHJ1ZSxcbiAgICAgICAgZW5hYmxlRG5zU3VwcG9ydDogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBUYWcgc3VibmV0cyBmb3IgRUtTIChvbmx5IGZvciBuZXcgVlBDKVxuICAgICAgY2RrLlRhZ3Mub2YodGhpcy52cGMpLmFkZCgna3ViZXJuZXRlcy5pby9jbHVzdGVyL21vc2FpYy1saWZlJywgJ3NoYXJlZCcpO1xuXG4gICAgICB0aGlzLnZwYy5wdWJsaWNTdWJuZXRzLmZvckVhY2goKHN1Ym5ldCwgaW5kZXgpID0+IHtcbiAgICAgICAgY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ2t1YmVybmV0ZXMuaW8vcm9sZS9lbGInLCAnMScpO1xuICAgICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgnTmFtZScsIGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tcHVibGljLSR7aW5kZXggKyAxfWApO1xuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudnBjLnByaXZhdGVTdWJuZXRzLmZvckVhY2goKHN1Ym5ldCwgaW5kZXgpID0+IHtcbiAgICAgICAgY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ2t1YmVybmV0ZXMuaW8vcm9sZS9pbnRlcm5hbC1lbGInLCAnMScpO1xuICAgICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgnTmFtZScsIGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tcHJpdmF0ZS0ke2luZGV4ICsgMX1gKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWUEMgRW5kcG9pbnRzIGZvciBBV1Mgc2VydmljZXMgdG8gcmVkdWNlIE5BVCBjb3N0cyAob25seSBmb3IgbmV3IFZQQylcbiAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdTZWNyZXRzTWFuYWdlckVuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnRUNSQXBpRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNSLFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdFQ1JEb2NrZXJFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQ1JfRE9DS0VSLFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBSb3V0ZTUzIEhvc3RlZCBab25lXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgaWYgKGhvc3RlZFpvbmVJZCkge1xuICAgICAgLy8gVXNlIGV4aXN0aW5nIGhvc3RlZCB6b25lXG4gICAgICB0aGlzLmhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICBob3N0ZWRab25lSWQsXG4gICAgICAgIHpvbmVOYW1lOiBkb21haW5OYW1lLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgaG9zdGVkIHpvbmVcbiAgICAgIHRoaXMuaG9zdGVkWm9uZSA9IG5ldyByb3V0ZTUzLlB1YmxpY0hvc3RlZFpvbmUodGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIHpvbmVOYW1lOiBkb21haW5OYW1lLFxuICAgICAgICBjb21tZW50OiBgSG9zdGVkIHpvbmUgZm9yICR7ZG9tYWluTmFtZX1gLFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOYW1lU2VydmVycycsIHtcbiAgICAgICAgdmFsdWU6IGNkay5Gbi5qb2luKCcsICcsIHRoaXMuaG9zdGVkWm9uZS5ob3N0ZWRab25lTmFtZVNlcnZlcnMgfHwgW10pLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1VwZGF0ZSB5b3VyIGRvbWFpbiByZWdpc3RyYXIgd2l0aCB0aGVzZSBuYW1lIHNlcnZlcnMnLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQUNNIENlcnRpZmljYXRlIHdpdGggU0FOc1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHRoaXMuY2VydGlmaWNhdGUgPSBuZXcgYWNtLkNlcnRpZmljYXRlKHRoaXMsICdDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWUsXG4gICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczogW1xuICAgICAgICBgKi4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgYGZyb250ZW5kLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICBgYmFja2VuZC4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgYGdyYXBoLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICBgY2hhdC4ke2RvbWFpbk5hbWV9YCxcbiAgICAgIF0sXG4gICAgICB2YWxpZGF0aW9uOiBhY20uQ2VydGlmaWNhdGVWYWxpZGF0aW9uLmZyb21EbnModGhpcy5ob3N0ZWRab25lKSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIHdpdGggU29jaWFsIExvZ2luc1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tdXNlcnNgLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZmFtaWx5TmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgLy8gTm90ZTogY3VzdG9tIGF0dHJpYnV0ZSBuYW1lcyBtdXN0IGJlIDw9IDIwIGNoYXJzXG4gICAgICAgIC8vIFRoaXMgd2lsbCBhcHBlYXIgYXMgXCJjdXN0b206cmVsYXRpb25zaGlwXCIgaW4gdG9rZW5zXG4gICAgICAgIHJlbGF0aW9uc2hpcDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDEyLFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDMpLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgbWZhOiBjb2duaXRvLk1mYS5PUFRJT05BTCxcbiAgICAgIG1mYVNlY29uZEZhY3Rvcjoge1xuICAgICAgICBzbXM6IHRydWUsXG4gICAgICAgIG90cDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICAvLyBOb3RlOiBhZHZhbmNlZFNlY3VyaXR5TW9kZSByZW1vdmVkIC0gcmVxdWlyZXMgQ29nbml0byBQbHVzIHBsYW5cbiAgICAgIC8vIEZvciBiYXNpYyBzZWN1cml0eSwgQ29nbml0byBwcm92aWRlcyBzdGFuZGFyZCBwcm90ZWN0aW9ucyBieSBkZWZhdWx0XG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIFBvb2wgRG9tYWluIGZvciBDb2duaXRvIGhvc3RlZCBVSVxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gdGhpcy51c2VyUG9vbC5hZGREb21haW4oJ0NvZ25pdG9Eb21haW4nLCB7XG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYG1vc2FpYy0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFwcCBDbGllbnQgZm9yIE9JREMgZmxvd1xuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSB0aGlzLnVzZXJQb29sLmFkZENsaWVudCgnV2ViQXBwQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAnbW9zYWljLXdlYi1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IHRydWUsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgICBjdXN0b206IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcbiAgICAgICAgXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtkb21haW5OYW1lfS9hdXRoL2NhbGxiYWNrYCxcbiAgICAgICAgICBgaHR0cHM6Ly9mcm9udGVuZC4ke2RvbWFpbk5hbWV9L2F1dGgvY2FsbGJhY2tgLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjUxNzMvYXV0aC9jYWxsYmFjaycsIC8vIERldlxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgYGh0dHBzOi8vZnJvbnRlbmQuJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgLy8gU29jaWFsIHByb3ZpZGVycyB3aWxsIGJlIGFkZGVkIGFmdGVyIGNvbmZpZ3VyYXRpb25cbiAgICAgIF0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIGVuYWJsZVRva2VuUmV2b2NhdGlvbjogdHJ1ZSxcbiAgICAgIGFjY2Vzc1Rva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICAgIGlkVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNjApLFxuICAgICAgcmVmcmVzaFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICB9KTtcblxuICAgIC8vIEdvb2dsZSBJZGVudGl0eSBQcm92aWRlciAocmVxdWlyZXMgbWFudWFsIGNvbmZpZ3VyYXRpb24pXG4gICAgY29uc3QgZ29vZ2xlUHJvdmlkZXIgPSBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjbGllbnRJZDogcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9JRCB8fCAnUkVQTEFDRV9XSVRIX0dPT0dMRV9DTElFTlRfSUQnLFxuICAgICAgY2xpZW50U2VjcmV0VmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoXG4gICAgICAgIHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfU0VDUkVUIHx8ICdSRVBMQUNFX1dJVEhfR09PR0xFX0NMSUVOVF9TRUNSRVQnXG4gICAgICApLFxuICAgICAgc2NvcGVzOiBbJ3Byb2ZpbGUnLCAnZW1haWwnLCAnb3BlbmlkJ10sXG4gICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9HSVZFTl9OQU1FLFxuICAgICAgICBmYW1pbHlOYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9GQU1JTFlfTkFNRSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgSWRlbnRpdHkgUHJvdmlkZXIgKHJlcXVpcmVzIG1hbnVhbCBjb25maWd1cmF0aW9uKVxuICAgIGNvbnN0IGdpdGh1YlByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyT2lkYyh0aGlzLCAnR2l0SHViUHJvdmlkZXInLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIG5hbWU6ICdHaXRIdWInLFxuICAgICAgY2xpZW50SWQ6IHByb2Nlc3MuZW52LkdJVEhVQl9DTElFTlRfSUQgfHwgJ1JFUExBQ0VfV0lUSF9HSVRIVUJfQ0xJRU5UX0lEJyxcbiAgICAgIGNsaWVudFNlY3JldDogcHJvY2Vzcy5lbnYuR0lUSFVCX0NMSUVOVF9TRUNSRVQgfHwgJ1JFUExBQ0VfV0lUSF9HSVRIVUJfQ0xJRU5UX1NFQ1JFVCcsXG4gICAgICBpc3N1ZXJVcmw6ICdodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tJyxcbiAgICAgIHNjb3BlczogWydvcGVuaWQnLCAnZW1haWwnLCAncHJvZmlsZSddLFxuICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5vdGhlcignZW1haWwnKSxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLm90aGVyKCduYW1lJyksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgQ29nbml0byBjb25maWd1cmF0aW9uIGluIFNlY3JldHMgTWFuYWdlclxuICAgIGNvbnN0IGNvZ25pdG9TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdDb2duaXRvQ29uZmlnJywge1xuICAgICAgc2VjcmV0TmFtZTogYG1vc2FpYy8ke2Vudmlyb25tZW50fS9jb2duaXRvLWNvbmZpZ2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gY29uZmlndXJhdGlvbiBmb3IgTW9zYWljIExpZmUnLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgdXNlclBvb2xJZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQpLFxuICAgICAgICB1c2VyUG9vbENsaWVudElkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCksXG4gICAgICAgIHVzZXJQb29sRG9tYWluOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUpLFxuICAgICAgICByZWdpb246IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQodGhpcy5yZWdpb24pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFMzIEJ1Y2tldHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBNZWRpYSBzdG9yYWdlIGJ1Y2tldFxuICAgIHRoaXMubWVkaWFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdNZWRpYUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tbWVkaWEtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnVHJhbnNpdGlvblRvSUEnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuR0xBQ0lFUl9JTlNUQU5UX1JFVFJJRVZBTCxcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxODApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRWZXJzaW9ucycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkRFTEVURSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgICAgIGBodHRwczovLyouJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDo1MTczJyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICBleHBvc2VkSGVhZGVyczogWydFVGFnJ10sXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEJhY2t1cCBidWNrZXRcbiAgICBjb25zdCBiYWNrdXBCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdCYWNrdXBCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWJhY2t1cHMtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdBcmNoaXZlT2xkQmFja3VwcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB0cmFuc2l0aW9uczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5HTEFDSUVSLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEVDUiBSZXBvc2l0b3JpZXNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB0aGlzLnJlcG9zaXRvcmllcyA9IHtcbiAgICAgIHdlYjogdGhpcy5jcmVhdGVFY3JSZXBvc2l0b3J5KCd3ZWInLCAnRnJvbnRlbmQgd2ViIGFwcGxpY2F0aW9uJyksXG4gICAgICBjb3JlQXBpOiB0aGlzLmNyZWF0ZUVjclJlcG9zaXRvcnkoJ2NvcmUtYXBpJywgJ0NvcmUgYmFja2VuZCBBUEknKSxcbiAgICB9O1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU05TL1NRUyBmb3IgRXZlbnQtRHJpdmVuIEFyY2hpdGVjdHVyZVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGRvbWFpbkV2ZW50c1RvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnRG9tYWluRXZlbnRzVG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZG9tYWluLWV2ZW50c2AsXG4gICAgICBkaXNwbGF5TmFtZTogJ01vc2FpYyBMaWZlIERvbWFpbiBFdmVudHMnLFxuICAgIH0pO1xuXG4gICAgLy8gRGVhZCBsZXR0ZXIgcXVldWUgZm9yIGZhaWxlZCBldmVudCBwcm9jZXNzaW5nXG4gICAgY29uc3QgZXZlbnRzRGxxID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRXZlbnRzRExRJywge1xuICAgICAgcXVldWVOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWV2ZW50cy1kbHFgLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgfSk7XG5cbiAgICAvLyBFdmVudHMgcXVldWUgZm9yIHByb2Nlc3NpbmdcbiAgICBjb25zdCBldmVudHNRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0V2ZW50c1F1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWV2ZW50c2AsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogZXZlbnRzRGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgZG9tYWluRXZlbnRzVG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgbmV3IGNkay5hd3Nfc25zX3N1YnNjcmlwdGlvbnMuU3FzU3Vic2NyaXB0aW9uKGV2ZW50c1F1ZXVlKVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBJQU0gUm9sZXMgZm9yIEVLUyBJUlNBXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb2xlIGZvciBjb3JlLWFwaSB0byBhY2Nlc3MgUzMsIFNlY3JldHMgTWFuYWdlciwgU1FTL1NOU1xuICAgIGNvbnN0IGNvcmVBcGlSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb3JlQXBpUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWNvcmUtYXBpLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgICBgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpvaWRjLXByb3ZpZGVyL29pZGMuZWtzLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vaWQvQ0xVU1RFUl9JRGAsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdvaWRjLmVrcy4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL2lkL0NMVVNURVJfSUQ6c3ViJzpcbiAgICAgICAgICAgICAgJ3N5c3RlbTpzZXJ2aWNlYWNjb3VudDptb3NhaWNsaWZlOmNvcmUtYXBpJyxcbiAgICAgICAgICAgICdvaWRjLmVrcy4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL2lkL0NMVVNURVJfSUQ6YXVkJzogJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICApLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgY29yZS1hcGkgc2VydmljZSBpbiBFS1MnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgdG8gY29yZS1hcGkgcm9sZVxuICAgIHRoaXMubWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoY29yZUFwaVJvbGUpO1xuICAgIGJhY2t1cEJ1Y2tldC5ncmFudFJlYWRXcml0ZShjb3JlQXBpUm9sZSk7XG4gICAgY29nbml0b1NlY3JldC5ncmFudFJlYWQoY29yZUFwaVJvbGUpO1xuICAgIGRvbWFpbkV2ZW50c1RvcGljLmdyYW50UHVibGlzaChjb3JlQXBpUm9sZSk7XG4gICAgZXZlbnRzUXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXMoY29yZUFwaVJvbGUpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gT3V0cHV0c1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVlBDIElEIGZvciBFS1MgY2x1c3RlcicsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXZwYy1pZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2VydGlmaWNhdGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5jZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQUNNIENlcnRpZmljYXRlIEFSTiBmb3IgQUxCJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tY2VydGlmaWNhdGUtYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS11c2VyLXBvb2wtaWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS11c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01lZGlhQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBmb3IgbWVkaWEgc3RvcmFnZScsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LW1lZGlhLWJ1Y2tldGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRG9tYWluRXZlbnRzVG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogZG9tYWluRXZlbnRzVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBmb3IgZG9tYWluIGV2ZW50cycsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWRvbWFpbi1ldmVudHMtdG9waWNgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0hvc3RlZFpvbmVJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdSb3V0ZTUzIEhvc3RlZCBab25lIElEJyxcbiAgICB9KTtcblxuICAgIE9iamVjdC5lbnRyaWVzKHRoaXMucmVwb3NpdG9yaWVzKS5mb3JFYWNoKChbbmFtZSwgcmVwb10pID0+IHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIGAke25hbWV9UmVwb3NpdG9yeVVyaWAsIHtcbiAgICAgICAgdmFsdWU6IHJlcG8ucmVwb3NpdG9yeVVyaSxcbiAgICAgICAgZGVzY3JpcHRpb246IGBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yICR7bmFtZX1gLFxuICAgICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWVjci0ke25hbWV9YCxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFY3JSZXBvc2l0b3J5KG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IGVjci5SZXBvc2l0b3J5IHtcbiAgICByZXR1cm4gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsIGAke25hbWV9UmVwb3NpdG9yeWAsIHtcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiBgbW9zYWljLWxpZmUvJHtuYW1lfWAsXG4gICAgICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgICBpbWFnZVRhZ011dGFiaWxpdHk6IGVjci5UYWdNdXRhYmlsaXR5Lk1VVEFCTEUsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdLZWVwIGxhc3QgMTAgaW1hZ2VzJyxcbiAgICAgICAgICBtYXhJbWFnZUNvdW50OiAxMCxcbiAgICAgICAgICBydWxlUHJpb3JpdHk6IDEsXG4gICAgICAgICAgdGFnU3RhdHVzOiBlY3IuVGFnU3RhdHVzLkFOWSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==