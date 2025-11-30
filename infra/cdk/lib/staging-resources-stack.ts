import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface StagingResourcesStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  domainName: string;
}

/**
 * Staging Resources Stack
 *
 * Creates staging-specific resources that complement the shared RDS instance:
 * - S3 buckets for staging media and backups
 * - IAM role for staging core-api (IRSA)
 * - Session secret for staging
 * - SNS/SQS for staging event-driven architecture
 *
 * The staging database is created manually on the shared RDS instance
 * and credentials are stored in Secrets Manager.
 */
export class StagingResourcesStack extends cdk.Stack {
  public readonly mediaBucket: s3.Bucket;
  public readonly backupBucket: s3.Bucket;
  public readonly coreApiRole: iam.Role;
  public readonly sessionSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StagingResourcesStackProps) {
    super(scope, id, props);

    const { domainName } = props;
    const environment = 'staging';

    // ============================================================
    // S3 Buckets for Staging
    // ============================================================
    this.mediaBucket = new s3.Bucket(this, 'StagingMediaBucket', {
      bucketName: `mosaic-${environment}-media-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Staging can be destroyed
      autoDeleteObjects: true, // Clean up on stack deletion
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
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
            `https://stage.${domainName}`,
            `https://stage-api.${domainName}`,
            'http://localhost:5173',
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    cdk.Tags.of(this.mediaBucket).add('Environment', environment);
    cdk.Tags.of(this.mediaBucket).add('Component', 'Storage');

    this.backupBucket = new s3.Bucket(this, 'StagingBackupBucket', {
      bucketName: `mosaic-${environment}-backups-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'ExpireOldBackups',
          enabled: true,
          expiration: cdk.Duration.days(30), // Shorter retention for staging
        },
      ],
    });

    cdk.Tags.of(this.backupBucket).add('Environment', environment);
    cdk.Tags.of(this.backupBucket).add('Component', 'Storage');

    // ============================================================
    // Session Secret for Staging
    // ============================================================
    this.sessionSecret = new secretsmanager.Secret(this, 'StagingSessionSecret', {
      secretName: `mosaic/${environment}/session/secret-key`,
      description: 'Session secret key for staging environment',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret-key',
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    cdk.Tags.of(this.sessionSecret).add('Environment', environment);
    cdk.Tags.of(this.sessionSecret).add('Component', 'Security');

    // ============================================================
    // SNS/SQS for Staging Event-Driven Architecture
    // ============================================================
    const domainEventsTopic = new sns.Topic(this, 'StagingDomainEventsTopic', {
      topicName: `mosaic-${environment}-domain-events`,
      displayName: 'Mosaic Life Staging Domain Events',
    });

    const eventsDlq = new sqs.Queue(this, 'StagingEventsDLQ', {
      queueName: `mosaic-${environment}-events-dlq`,
      retentionPeriod: cdk.Duration.days(7), // Shorter for staging
    });

    const eventsQueue = new sqs.Queue(this, 'StagingEventsQueue', {
      queueName: `mosaic-${environment}-events`,
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: eventsDlq,
        maxReceiveCount: 3,
      },
    });

    domainEventsTopic.addSubscription(
      new sns_subscriptions.SqsSubscription(eventsQueue)
    );

    // ============================================================
    // IAM Role for Staging core-api (IRSA)
    // ============================================================
    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';

    this.coreApiRole = new iam.Role(this, 'StagingCoreApiRole', {
      roleName: `mosaic-${environment}-core-api-role`,
      assumedBy: new iam.WebIdentityPrincipal(
        `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`,
        {
          StringEquals: {
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:sub`]:
              `system:serviceaccount:mosaic-${environment}:core-api`,
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:aud`]: 'sts.amazonaws.com',
          },
        }
      ),
      description: 'IAM role for staging core-api service in EKS',
    });

    // Grant S3 access
    this.mediaBucket.grantReadWrite(this.coreApiRole);
    this.backupBucket.grantReadWrite(this.coreApiRole);

    // Grant Secrets Manager access for staging secrets
    this.coreApiRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowStagingSecretsAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:mosaic/staging/*`,
        ],
      })
    );

    // Grant SNS/SQS access
    domainEventsTopic.grantPublish(this.coreApiRole);
    eventsQueue.grantConsumeMessages(this.coreApiRole);

    cdk.Tags.of(this.coreApiRole).add('Environment', environment);
    cdk.Tags.of(this.coreApiRole).add('Component', 'IAM');

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'StagingMediaBucketName', {
      value: this.mediaBucket.bucketName,
      description: 'S3 bucket for staging media storage',
      exportName: `mosaic-${environment}-media-bucket`,
    });

    new cdk.CfnOutput(this, 'StagingBackupBucketName', {
      value: this.backupBucket.bucketName,
      description: 'S3 bucket for staging backups',
      exportName: `mosaic-${environment}-backup-bucket`,
    });

    new cdk.CfnOutput(this, 'StagingCoreApiRoleArn', {
      value: this.coreApiRole.roleArn,
      description: 'IRSA role ARN for staging core-api',
      exportName: `mosaic-${environment}-core-api-role-arn`,
    });

    new cdk.CfnOutput(this, 'StagingSessionSecretArn', {
      value: this.sessionSecret.secretArn,
      description: 'Session secret ARN for staging',
      exportName: `mosaic-${environment}-session-secret-arn`,
    });

    new cdk.CfnOutput(this, 'StagingDomainEventsTopicArn', {
      value: domainEventsTopic.topicArn,
      description: 'SNS topic for staging domain events',
      exportName: `mosaic-${environment}-domain-events-topic`,
    });
  }
}
