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
        const { domainName, hostedZoneId, environment } = props.config;
        // ============================================================
        // VPC for EKS
        // ============================================================
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
        // Tag subnets for EKS
        cdk.Tags.of(this.vpc).add('kubernetes.io/cluster/mosaic-life', 'shared');
        this.vpc.publicSubnets.forEach((subnet, index) => {
            cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
            cdk.Tags.of(subnet).add('Name', `mosaic-${environment}-public-${index + 1}`);
        });
        this.vpc.privateSubnets.forEach((subnet, index) => {
            cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
            cdk.Tags.of(subnet).add('Name', `mosaic-${environment}-private-${index + 1}`);
        });
        // VPC Endpoints for AWS services to reduce NAT costs
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9zYWljLWxpZmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3NhaWMtbGlmZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxpRUFBbUQ7QUFDbkQsd0VBQTBEO0FBQzFELGlFQUFtRDtBQUNuRCx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLCtFQUFpRTtBQUNqRSx5REFBMkM7QUFDM0MseURBQTJDO0FBWTNDLE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQVM1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFFL0QsK0RBQStEO1FBQy9ELGNBQWM7UUFDZCwrREFBK0Q7UUFDL0QsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN4QyxPQUFPLEVBQUUsVUFBVSxXQUFXLE1BQU07WUFDcEMsTUFBTSxFQUFFLENBQUM7WUFDVCxXQUFXLEVBQUUsQ0FBQyxFQUFFLG9CQUFvQjtZQUNwQyxtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTTtvQkFDakMsUUFBUSxFQUFFLEVBQUU7aUJBQ2I7Z0JBQ0Q7b0JBQ0UsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO29CQUM5QyxRQUFRLEVBQUUsRUFBRTtpQkFDYjthQUNG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Z0JBQ2Q7b0JBQ0UsV0FBVyxFQUFFLHFCQUFxQjtvQkFDbEMsYUFBYSxFQUFFLEVBQUU7b0JBQ2pCLFlBQVksRUFBRSxDQUFDO29CQUNmLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUc7aUJBQzdCO2FBQ0Y7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4Y0QsMENBd2NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIGFjbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1vc2FpY0xpZmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBjb25maWc6IHtcbiAgICBkb21haW5OYW1lOiBzdHJpbmc7XG4gICAgaG9zdGVkWm9uZUlkPzogc3RyaW5nO1xuICAgIGVudmlyb25tZW50OiBzdHJpbmc7XG4gICAgdGFnczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgfTtcbn1cblxuZXhwb3J0IGNsYXNzIE1vc2FpY0xpZmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5WcGM7XG4gIHB1YmxpYyByZWFkb25seSBob3N0ZWRab25lOiByb3V0ZTUzLklIb3N0ZWRab25lO1xuICBwdWJsaWMgcmVhZG9ubHkgY2VydGlmaWNhdGU6IGFjbS5DZXJ0aWZpY2F0ZTtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG4gIHB1YmxpYyByZWFkb25seSBtZWRpYUJ1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgcmVhZG9ubHkgcmVwb3NpdG9yaWVzOiB7IFtrZXk6IHN0cmluZ106IGVjci5SZXBvc2l0b3J5IH07XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE1vc2FpY0xpZmVTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGRvbWFpbk5hbWUsIGhvc3RlZFpvbmVJZCwgZW52aXJvbm1lbnQgfSA9IHByb3BzLmNvbmZpZztcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFZQQyBmb3IgRUtTXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnTW9zYWljVlBDJywge1xuICAgICAgdnBjTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS12cGNgLFxuICAgICAgbWF4QXpzOiAzLFxuICAgICAgbmF0R2F0ZXdheXM6IDIsIC8vIEhpZ2ggYXZhaWxhYmlsaXR5XG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ1ByaXZhdGUnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgICAgY2lkck1hc2s6IDIwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGVuYWJsZURuc0hvc3RuYW1lczogdHJ1ZSxcbiAgICAgIGVuYWJsZURuc1N1cHBvcnQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBUYWcgc3VibmV0cyBmb3IgRUtTXG4gICAgY2RrLlRhZ3Mub2YodGhpcy52cGMpLmFkZCgna3ViZXJuZXRlcy5pby9jbHVzdGVyL21vc2FpYy1saWZlJywgJ3NoYXJlZCcpO1xuXG4gICAgdGhpcy52cGMucHVibGljU3VibmV0cy5mb3JFYWNoKChzdWJuZXQsIGluZGV4KSA9PiB7XG4gICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgna3ViZXJuZXRlcy5pby9yb2xlL2VsYicsICcxJyk7XG4gICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgnTmFtZScsIGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tcHVibGljLSR7aW5kZXggKyAxfWApO1xuICAgIH0pO1xuXG4gICAgdGhpcy52cGMucHJpdmF0ZVN1Ym5ldHMuZm9yRWFjaCgoc3VibmV0LCBpbmRleCkgPT4ge1xuICAgICAgY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ2t1YmVybmV0ZXMuaW8vcm9sZS9pbnRlcm5hbC1lbGInLCAnMScpO1xuICAgICAgY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ05hbWUnLCBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXByaXZhdGUtJHtpbmRleCArIDF9YCk7XG4gICAgfSk7XG5cbiAgICAvLyBWUEMgRW5kcG9pbnRzIGZvciBBV1Mgc2VydmljZXMgdG8gcmVkdWNlIE5BVCBjb3N0c1xuICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdTZWNyZXRzTWFuYWdlckVuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgfSk7XG5cbiAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnRUNSQXBpRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkVDUixcbiAgICB9KTtcblxuICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdFQ1JEb2NrZXJFbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNSX0RPQ0tFUixcbiAgICB9KTtcblxuICAgIHRoaXMudnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNFbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gUm91dGU1MyBIb3N0ZWQgWm9uZVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGlmIChob3N0ZWRab25lSWQpIHtcbiAgICAgIC8vIFVzZSBleGlzdGluZyBob3N0ZWQgem9uZVxuICAgICAgdGhpcy5ob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgICAgaG9zdGVkWm9uZUlkLFxuICAgICAgICB6b25lTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IGhvc3RlZCB6b25lXG4gICAgICB0aGlzLmhvc3RlZFpvbmUgPSBuZXcgcm91dGU1My5QdWJsaWNIb3N0ZWRab25lKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICB6b25lTmFtZTogZG9tYWluTmFtZSxcbiAgICAgICAgY29tbWVudDogYEhvc3RlZCB6b25lIGZvciAke2RvbWFpbk5hbWV9YCxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTmFtZVNlcnZlcnMnLCB7XG4gICAgICAgIHZhbHVlOiBjZGsuRm4uam9pbignLCAnLCB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZU5hbWVTZXJ2ZXJzIHx8IFtdKSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdVcGRhdGUgeW91ciBkb21haW4gcmVnaXN0cmFyIHdpdGggdGhlc2UgbmFtZSBzZXJ2ZXJzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFDTSBDZXJ0aWZpY2F0ZSB3aXRoIFNBTnNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB0aGlzLmNlcnRpZmljYXRlID0gbmV3IGFjbS5DZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lLFxuICAgICAgc3ViamVjdEFsdGVybmF0aXZlTmFtZXM6IFtcbiAgICAgICAgYCouJHtkb21haW5OYW1lfWAsXG4gICAgICAgIGBmcm9udGVuZC4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgYGJhY2tlbmQuJHtkb21haW5OYW1lfWAsXG4gICAgICAgIGBncmFwaC4ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgYGNoYXQuJHtkb21haW5OYW1lfWAsXG4gICAgICBdLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKHRoaXMuaG9zdGVkWm9uZSksXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCB3aXRoIFNvY2lhbCBMb2dpbnNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB0aGlzLnVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1VzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LXVzZXJzYCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgIC8vIE5vdGU6IGN1c3RvbSBhdHRyaWJ1dGUgbmFtZXMgbXVzdCBiZSA8PSAyMCBjaGFyc1xuICAgICAgICAvLyBUaGlzIHdpbGwgYXBwZWFyIGFzIFwiY3VzdG9tOnJlbGF0aW9uc2hpcFwiIGluIHRva2Vuc1xuICAgICAgICByZWxhdGlvbnNoaXA6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7XG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiAxMixcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXG4gICAgICAgIHRlbXBQYXNzd29yZFZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzKSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIG1mYTogY29nbml0by5NZmEuT1BUSU9OQUwsXG4gICAgICBtZmFTZWNvbmRGYWN0b3I6IHtcbiAgICAgICAgc21zOiB0cnVlLFxuICAgICAgICBvdHA6IHRydWUsXG4gICAgICB9LFxuICAgICAgLy8gTm90ZTogYWR2YW5jZWRTZWN1cml0eU1vZGUgcmVtb3ZlZCAtIHJlcXVpcmVzIENvZ25pdG8gUGx1cyBwbGFuXG4gICAgICAvLyBGb3IgYmFzaWMgc2VjdXJpdHksIENvZ25pdG8gcHJvdmlkZXMgc3RhbmRhcmQgcHJvdGVjdGlvbnMgYnkgZGVmYXVsdFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciBQb29sIERvbWFpbiBmb3IgQ29nbml0byBob3N0ZWQgVUlcbiAgICBjb25zdCB1c2VyUG9vbERvbWFpbiA9IHRoaXMudXNlclBvb2wuYWRkRG9tYWluKCdDb2duaXRvRG9tYWluJywge1xuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBcHAgQ2xpZW50IGZvciBPSURDIGZsb3dcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gdGhpcy51c2VyUG9vbC5hZGRDbGllbnQoJ1dlYkFwcENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ21vc2FpYy13ZWItY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiB0cnVlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgIGBodHRwczovLyR7ZG9tYWluTmFtZX0vYXV0aC9jYWxsYmFja2AsXG4gICAgICAgICAgYGh0dHBzOi8vZnJvbnRlbmQuJHtkb21haW5OYW1lfS9hdXRoL2NhbGxiYWNrYCxcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDo1MTczL2F1dGgvY2FsbGJhY2snLCAvLyBEZXZcbiAgICAgICAgXSxcbiAgICAgICAgbG9nb3V0VXJsczogW1xuICAgICAgICAgIGBodHRwczovLyR7ZG9tYWluTmFtZX1gLFxuICAgICAgICAgIGBodHRwczovL2Zyb250ZW5kLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjUxNzMnLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgICAgIC8vIFNvY2lhbCBwcm92aWRlcnMgd2lsbCBiZSBhZGRlZCBhZnRlciBjb25maWd1cmF0aW9uXG4gICAgICBdLFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgICBlbmFibGVUb2tlblJldm9jYXRpb246IHRydWUsXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24ubWludXRlcyg2MCksXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICAgIHJlZnJlc2hUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgfSk7XG5cbiAgICAvLyBHb29nbGUgSWRlbnRpdHkgUHJvdmlkZXIgKHJlcXVpcmVzIG1hbnVhbCBjb25maWd1cmF0aW9uKVxuICAgIGNvbnN0IGdvb2dsZVByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsICdHb29nbGVQcm92aWRlcicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY2xpZW50SWQ6IHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfSUQgfHwgJ1JFUExBQ0VfV0lUSF9HT09HTEVfQ0xJRU5UX0lEJyxcbiAgICAgIGNsaWVudFNlY3JldFZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KFxuICAgICAgICBwcm9jZXNzLmVudi5HT09HTEVfQ0xJRU5UX1NFQ1JFVCB8fCAnUkVQTEFDRV9XSVRIX0dPT0dMRV9DTElFTlRfU0VDUkVUJ1xuICAgICAgKSxcbiAgICAgIHNjb3BlczogWydwcm9maWxlJywgJ2VtYWlsJywgJ29wZW5pZCddLFxuICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRU1BSUwsXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcbiAgICAgICAgZmFtaWx5TmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRkFNSUxZX05BTUUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIElkZW50aXR5IFByb3ZpZGVyIChyZXF1aXJlcyBtYW51YWwgY29uZmlndXJhdGlvbilcbiAgICBjb25zdCBnaXRodWJQcm92aWRlciA9IG5ldyBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlck9pZGModGhpcywgJ0dpdEh1YlByb3ZpZGVyJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBuYW1lOiAnR2l0SHViJyxcbiAgICAgIGNsaWVudElkOiBwcm9jZXNzLmVudi5HSVRIVUJfQ0xJRU5UX0lEIHx8ICdSRVBMQUNFX1dJVEhfR0lUSFVCX0NMSUVOVF9JRCcsXG4gICAgICBjbGllbnRTZWNyZXQ6IHByb2Nlc3MuZW52LkdJVEhVQl9DTElFTlRfU0VDUkVUIHx8ICdSRVBMQUNFX1dJVEhfR0lUSFVCX0NMSUVOVF9TRUNSRVQnLFxuICAgICAgaXNzdWVyVXJsOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gICAgICBzY29wZXM6IFsnb3BlbmlkJywgJ2VtYWlsJywgJ3Byb2ZpbGUnXSxcbiAgICAgIGF0dHJpYnV0ZU1hcHBpbmc6IHtcbiAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUub3RoZXIoJ2VtYWlsJyksXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5vdGhlcignbmFtZScpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIENvZ25pdG8gY29uZmlndXJhdGlvbiBpbiBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBjb2duaXRvU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQ29nbml0b0NvbmZpZycsIHtcbiAgICAgIHNlY3JldE5hbWU6IGBtb3NhaWMvJHtlbnZpcm9ubWVudH0vY29nbml0by1jb25maWdgLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIGNvbmZpZ3VyYXRpb24gZm9yIE1vc2FpYyBMaWZlJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIHVzZXJQb29sSWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQodGhpcy51c2VyUG9vbC51c2VyUG9vbElkKSxcbiAgICAgICAgdXNlclBvb2xDbGllbnRJZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQpLFxuICAgICAgICB1c2VyUG9vbERvbWFpbjogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lKSxcbiAgICAgICAgcmVnaW9uOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHRoaXMucmVnaW9uKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTMyBCdWNrZXRzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gTWVkaWEgc3RvcmFnZSBidWNrZXRcbiAgICB0aGlzLm1lZGlhQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnTWVkaWFCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LW1lZGlhLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ1RyYW5zaXRpb25Ub0lBJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLkdMQUNJRVJfSU5TVEFOVF9SRVRSSUVWQUwsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMTgwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmVyc2lvbnMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkdFVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBPU1QsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5ERUxFVEUsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1xuICAgICAgICAgICAgYGh0dHBzOi8vJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgICBgaHR0cHM6Ly8qLiR7ZG9tYWluTmFtZX1gLFxuICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFsnRVRhZyddLFxuICAgICAgICAgIG1heEFnZTogMzAwMCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBCYWNrdXAgYnVja2V0XG4gICAgY29uc3QgYmFja3VwQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmFja3VwQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1iYWNrdXBzLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnQXJjaGl2ZU9sZEJhY2t1cHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuR0xBQ0lFUixcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzY1KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBFQ1IgUmVwb3NpdG9yaWVzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdGhpcy5yZXBvc2l0b3JpZXMgPSB7XG4gICAgICB3ZWI6IHRoaXMuY3JlYXRlRWNyUmVwb3NpdG9yeSgnd2ViJywgJ0Zyb250ZW5kIHdlYiBhcHBsaWNhdGlvbicpLFxuICAgICAgY29yZUFwaTogdGhpcy5jcmVhdGVFY3JSZXBvc2l0b3J5KCdjb3JlLWFwaScsICdDb3JlIGJhY2tlbmQgQVBJJyksXG4gICAgfTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNOUy9TUVMgZm9yIEV2ZW50LURyaXZlbiBBcmNoaXRlY3R1cmVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBkb21haW5FdmVudHNUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0RvbWFpbkV2ZW50c1RvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWRvbWFpbi1ldmVudHNgLFxuICAgICAgZGlzcGxheU5hbWU6ICdNb3NhaWMgTGlmZSBEb21haW4gRXZlbnRzJyxcbiAgICB9KTtcblxuICAgIC8vIERlYWQgbGV0dGVyIHF1ZXVlIGZvciBmYWlsZWQgZXZlbnQgcHJvY2Vzc2luZ1xuICAgIGNvbnN0IGV2ZW50c0RscSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0V2ZW50c0RMUScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1ldmVudHMtZGxxYCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgIH0pO1xuXG4gICAgLy8gRXZlbnRzIHF1ZXVlIGZvciBwcm9jZXNzaW5nXG4gICAgY29uc3QgZXZlbnRzUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdFdmVudHNRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1ldmVudHNgLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IGV2ZW50c0RscSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGRvbWFpbkV2ZW50c1RvcGljLmFkZFN1YnNjcmlwdGlvbihcbiAgICAgIG5ldyBjZGsuYXdzX3Nuc19zdWJzY3JpcHRpb25zLlNxc1N1YnNjcmlwdGlvbihldmVudHNRdWV1ZSlcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gSUFNIFJvbGVzIGZvciBFS1MgSVJTQVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gUm9sZSBmb3IgY29yZS1hcGkgdG8gYWNjZXNzIFMzLCBTZWNyZXRzIE1hbmFnZXIsIFNRUy9TTlNcbiAgICBjb25zdCBjb3JlQXBpUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29yZUFwaVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1jb3JlLWFwaS1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06b2lkYy1wcm92aWRlci9vaWRjLmVrcy4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL2lkL0NMVVNURVJfSURgLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAnb2lkYy5la3MuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS9pZC9DTFVTVEVSX0lEOnN1Yic6XG4gICAgICAgICAgICAgICdzeXN0ZW06c2VydmljZWFjY291bnQ6bW9zYWljbGlmZTpjb3JlLWFwaScsXG4gICAgICAgICAgICAnb2lkYy5la3MuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS9pZC9DTFVTVEVSX0lEOmF1ZCc6ICdzdHMuYW1hem9uYXdzLmNvbScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGNvcmUtYXBpIHNlcnZpY2UgaW4gRUtTJyxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIGNvcmUtYXBpIHJvbGVcbiAgICB0aGlzLm1lZGlhQnVja2V0LmdyYW50UmVhZFdyaXRlKGNvcmVBcGlSb2xlKTtcbiAgICBiYWNrdXBCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoY29yZUFwaVJvbGUpO1xuICAgIGNvZ25pdG9TZWNyZXQuZ3JhbnRSZWFkKGNvcmVBcGlSb2xlKTtcbiAgICBkb21haW5FdmVudHNUb3BpYy5ncmFudFB1Ymxpc2goY29yZUFwaVJvbGUpO1xuICAgIGV2ZW50c1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKGNvcmVBcGlSb2xlKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIE91dHB1dHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVnBjSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy52cGMudnBjSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1ZQQyBJRCBmb3IgRUtTIGNsdXN0ZXInLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS12cGMtaWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NlcnRpZmljYXRlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuY2VydGlmaWNhdGUuY2VydGlmaWNhdGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FDTSBDZXJ0aWZpY2F0ZSBBUk4gZm9yIEFMQicsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWNlcnRpZmljYXRlLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tdXNlci1wb29sLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tdXNlci1wb29sLWNsaWVudC1pZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xEb21haW4uZG9tYWluTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZWRpYUJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tZWRpYUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgZm9yIG1lZGlhIHN0b3JhZ2UnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1tZWRpYS1idWNrZXRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RvbWFpbkV2ZW50c1RvcGljQXJuJywge1xuICAgICAgdmFsdWU6IGRvbWFpbkV2ZW50c1RvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTTlMgdG9waWMgZm9yIGRvbWFpbiBldmVudHMnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1kb21haW4tZXZlbnRzLXRvcGljYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdIb3N0ZWRab25lSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm91dGU1MyBIb3N0ZWQgWm9uZSBJRCcsXG4gICAgfSk7XG5cbiAgICBPYmplY3QuZW50cmllcyh0aGlzLnJlcG9zaXRvcmllcykuZm9yRWFjaCgoW25hbWUsIHJlcG9dKSA9PiB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBgJHtuYW1lfVJlcG9zaXRvcnlVcmlgLCB7XG4gICAgICAgIHZhbHVlOiByZXBvLnJlcG9zaXRvcnlVcmksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgRUNSIHJlcG9zaXRvcnkgVVJJIGZvciAke25hbWV9YCxcbiAgICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1lY3ItJHtuYW1lfWAsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRWNyUmVwb3NpdG9yeShuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBlY3IuUmVwb3NpdG9yeSB7XG4gICAgcmV0dXJuIG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCBgJHtuYW1lfVJlcG9zaXRvcnlgLCB7XG4gICAgICByZXBvc2l0b3J5TmFtZTogYG1vc2FpYy1saWZlLyR7bmFtZX1gLFxuICAgICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgICAgaW1hZ2VUYWdNdXRhYmlsaXR5OiBlY3IuVGFnTXV0YWJpbGl0eS5NVVRBQkxFLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnS2VlcCBsYXN0IDEwIGltYWdlcycsXG4gICAgICAgICAgbWF4SW1hZ2VDb3VudDogMTAsXG4gICAgICAgICAgcnVsZVByaW9yaXR5OiAxLFxuICAgICAgICAgIHRhZ1N0YXR1czogZWNyLlRhZ1N0YXR1cy5BTlksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuICB9XG59XG4iXX0=