import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { AIChatGuardrail } from './guardrail-construct';

export interface MosaicLifeStackProps extends cdk.StackProps {
  config: {
    domainName: string;
    hostedZoneId?: string;
    environment: string;
    vpcId?: string; // Optional: use existing VPC instead of creating new one
    existingUserPoolId?: string; // Optional: import existing Cognito User Pool
    existingEcrRepos?: boolean; // If true, import existing ECR repositories
    existingS3Buckets?: boolean; // If true, import existing S3 buckets
    tags: { [key: string]: string };
  };
}

export class MosaicLifeStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.Certificate;
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly mediaBucket: s3.IBucket;
  public readonly repositories: { [key: string]: ecr.IRepository };

  constructor(scope: Construct, id: string, props: MosaicLifeStackProps) {
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
    } else {
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
    } else {
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
    } else {
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
      clientSecretValue: cdk.SecretValue.unsafePlainText(
        process.env.GOOGLE_CLIENT_SECRET || 'REPLACE_WITH_GOOGLE_CLIENT_SECRET'
      ),
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

    // Session Secret for production
    const sessionSecret = new secretsmanager.Secret(this, 'SessionSecret', {
      secretName: `mosaic/${environment}/session/secret-key`,
      description: 'Session secret key for authentication',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret-key',
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    cdk.Tags.of(sessionSecret).add('Environment', environment);
    cdk.Tags.of(sessionSecret).add('Component', 'Security');

    // ============================================================
    // S3 Buckets
    // ============================================================
    // Media storage bucket
    if (existingS3Buckets) {
      // Import existing bucket
      this.mediaBucket = s3.Bucket.fromBucketName(this, 'MediaBucket', `mosaic-${environment}-media-${this.account}`);

      // Add CORS rule to existing bucket using Custom Resource
      new cr.AwsCustomResource(this, 'MediaBucketCors', {
        onCreate: {
          service: 'S3',
          action: 'putBucketCors',
          parameters: {
            Bucket: this.mediaBucket.bucketName,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ['*'],
                  AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
                  AllowedOrigins: [
                    `https://${domainName}`,
                    `https://*.${domainName}`,
                    'http://localhost:5173',
                  ],
                  ExposedHeaders: ['ETag'],
                  MaxAgeSeconds: 3000,
                },
              ],
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of('MediaBucketCors'),
        },
        onUpdate: {
          service: 'S3',
          action: 'putBucketCors',
          parameters: {
            Bucket: this.mediaBucket.bucketName,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ['*'],
                  AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
                  AllowedOrigins: [
                    `https://${domainName}`,
                    `https://*.${domainName}`,
                    'http://localhost:5173',
                  ],
                  ExposedHeaders: ['ETag'],
                  MaxAgeSeconds: 3000,
                },
              ],
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of('MediaBucketCors'),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [this.mediaBucket.bucketArn],
        }),
      });
    } else {
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
    let backupBucket: s3.IBucket;
    if (existingS3Buckets) {
      backupBucket = s3.Bucket.fromBucketName(this, 'BackupBucket', `mosaic-${environment}-backups-${this.account}`);
    } else {
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
        docs: ecr.Repository.fromRepositoryName(this, 'docsRepository', 'mosaic-life/docs'),
      };
    } else {
      // Create new ECR repositories
      this.repositories = {
        web: this.createEcrRepository('web', 'Frontend web application'),
        coreApi: this.createEcrRepository('core-api', 'Core backend API'),
        docs: this.createEcrRepository('docs', 'Documentation site'),
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

    domainEventsTopic.addSubscription(
      new cdk.aws_sns_subscriptions.SqsSubscription(eventsQueue)
    );

    // ============================================================
    // IAM Roles for EKS IRSA
    // ============================================================

    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';
    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`;
    const oidcProviderUrl = `oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`;

    // Role for core-api to access S3, Secrets Manager, SQS/SNS
    // Allows both the main environment namespace and preview-* namespaces
    const coreApiRole = new iam.Role(this, 'CoreApiRole', {
      roleName: `mosaic-${environment}-core-api-role`,
      assumedBy: new iam.FederatedPrincipal(
        oidcProviderArn,
        {
          StringEquals: {
            [`${oidcProviderUrl}:aud`]: 'sts.amazonaws.com',
          },
          StringLike: {
            [`${oidcProviderUrl}:sub`]: [
              `system:serviceaccount:mosaic-${environment}:core-api`,
              'system:serviceaccount:preview-*:core-api',
            ],
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'IAM role for core-api service in EKS (includes preview environments)',
    });

    // Grant permissions to core-api role
    this.mediaBucket.grantReadWrite(coreApiRole);
    backupBucket.grantReadWrite(coreApiRole);
    cognitoSecret.grantRead(coreApiRole);
    domainEventsTopic.grantPublish(coreApiRole);
    eventsQueue.grantConsumeMessages(coreApiRole);

    // Grant Bedrock access for AI chat feature
    // Cross-region inference (us.* model IDs) may route to any US region
    coreApiRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowBedrockInvoke',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          // Allow access to Claude foundation models in all US regions
          // Cross-region inference may route to any of these
          'arn:aws:bedrock:us-east-1::foundation-model/anthropic.*',
          'arn:aws:bedrock:us-east-2::foundation-model/anthropic.*',
          'arn:aws:bedrock:us-west-2::foundation-model/anthropic.*',
          // Allow cross-region inference profiles
          `arn:aws:bedrock:us-east-1:${this.account}:inference-profile/us.anthropic.*`,
          `arn:aws:bedrock:us-east-2:${this.account}:inference-profile/us.anthropic.*`,
          `arn:aws:bedrock:us-west-2:${this.account}:inference-profile/us.anthropic.*`,
        ],
      })
    );

    // ============================================================
    // Bedrock Guardrail for AI Chat
    // ============================================================
    const aiGuardrail = new AIChatGuardrail(this, 'AIChatGuardrail', {
      environment,
    });

    // Grant permission to apply guardrail
    coreApiRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowBedrockGuardrail',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        resources: [aiGuardrail.guardrailArn],
      })
    );

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

    new cdk.CfnOutput(this, 'AIGuardrailId', {
      value: aiGuardrail.guardrailId,
      description: 'Bedrock Guardrail ID for AI chat',
      exportName: `mosaic-${environment}-ai-guardrail-id`,
    });

    new cdk.CfnOutput(this, 'AIGuardrailVersion', {
      value: aiGuardrail.guardrailVersion,
      description: 'Bedrock Guardrail Version for AI chat',
      exportName: `mosaic-${environment}-ai-guardrail-version`,
    });
  }

  private createEcrRepository(name: string, description: string): ecr.Repository {
    return new ecr.Repository(this, `${name}Repository`, {
      repositoryName: `mosaic-life/${name}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          description: 'Keep last 5 production images (prod-* tags)',
          maxImageCount: 5,
          rulePriority: 1,
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: ['prod-'],
        },
        {
          description: 'Keep last 3 staging images (staging-* tags)',
          maxImageCount: 3,
          rulePriority: 2,
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: ['staging-'],
        },
        {
          description: 'Expire PR images after 7 days (pr-* tags)',
          maxImageAge: cdk.Duration.days(7),
          rulePriority: 3,
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: ['pr-'],
        },
        {
          description: 'Expire feature images after 7 days (feature-* tags)',
          maxImageAge: cdk.Duration.days(7),
          rulePriority: 4,
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: ['feature-'],
        },
        {
          description: 'Keep last 10 untagged images (signatures/cache)',
          maxImageCount: 10,
          rulePriority: 5,
          tagStatus: ecr.TagStatus.UNTAGGED,
        },
        {
          description: 'Keep last 20 remaining images (branch names, semver, latest)',
          maxImageCount: 20,
          rulePriority: 6,
          tagStatus: ecr.TagStatus.ANY,
        },
      ],
    });
  }
}
