import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface RdsStackProps extends cdk.StackProps {
  /** Imported VPC (used for security groups only; subnets are pinned by ID, see below). */
  vpc: ec2.IVpc;
  /** Create the temporary db-copy task definitions and the Aurora ingress rule. */
  dbCopy?: boolean;
  /** Existing Aurora cluster security group (db-copy ingress target). */
  auroraSecurityGroupId?: string;
}

/** SSM parameters published by the infra-repo foundation. */
const PRIVATE_SUBNET_PARAMS = ['us-east-1a', 'us-east-1b', 'us-east-1c'].map(
  (az) => `/mosaiclife/network/subnets/private/${az}`,
);

/**
 * Lean RDS PostgreSQL stack (design D5): one db.t4g.micro instance hosting the `core`
 * (prod) and `core_staging` databases. Only instantiated when `-c leanRuntime=true`.
 *
 * Consumers (ECS runtime stacks, group 7) read the SSM parameters under
 * `/mosaiclife/lean/rds/` instead of CloudFormation exports, keeping stacks decoupled.
 */
export class MosaicRdsStack extends cdk.Stack {
  public readonly instance: rds.DatabaseInstance;
  public readonly clientsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);
    const { vpc } = props;

    // Latest 16.x available in us-east-1 at authoring time; not in the CDK enum yet.
    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of('16.15', '16'),
    });

    // Subnets are pinned by explicit ID (deploy-time SSM resolution), never by SubnetType.
    // The foundation VPC is later redeployed with natGateways=0, which re-tags these same
    // subnets Private -> Isolated; a type-based selection would then change the subnet
    // group and could replace the database.
    const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
      description: 'Lean RDS subnets (pinned by ID)',
      vpc,
      vpcSubnets: {
        subnets: PRIVATE_SUBNET_PARAMS.map((p, i) =>
          ec2.Subnet.fromSubnetId(this, `PrivateSubnet${i}`, ssm.StringParameter.valueForStringParameter(this, p)),
        ),
      },
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      securityGroupName: 'mosaic-lean-db-sg',
      description: 'Lean RDS PostgreSQL (ingress only from mosaic-db-clients)',
      allowAllOutbound: false,
    });
    this.clientsSecurityGroup = new ec2.SecurityGroup(this, 'DbClientsSecurityGroup', {
      vpc,
      securityGroupName: 'mosaic-db-clients',
      description: 'Attach to ECS tasks that need to reach the lean RDS instance',
      allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(this.clientsSecurityGroup, ec2.Port.tcp(5432), 'PostgreSQL from db clients');

    const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
      engine,
      description: 'Mosaic lean RDS PostgreSQL 16',
      parameters: {
        statement_timeout: '30000',
        idle_in_transaction_session_timeout: '300000',
        'rds.force_ssl': '1',
      },
    });

    this.instance = new rds.DatabaseInstance(this, 'Instance', {
      instanceIdentifier: 'mosaic-lean-db',
      engine,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      subnetGroup,
      securityGroups: [dbSecurityGroup],
      publiclyAccessible: false,
      multiAz: false,
      parameterGroup,
      // databaseName intentionally unset: rds-bootstrap.sql creates `core` and `core_staging`.
      credentials: rds.Credentials.fromGeneratedSecret('mosaic_admin', {
        secretName: 'mosaic/shared/rds-lean/master',
      }),
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '07:00-08:00',
      preferredMaintenanceWindow: 'sun:08:30-sun:09:30',
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      enablePerformanceInsights: false,
      autoMinorVersionUpgrade: true,
    });
    const masterSecret = this.instance.secret!;

    // Consumers resolve these with ssm.StringParameter.valueForStringParameter.
    const publish = (name: string, value: string, description: string) =>
      new ssm.StringParameter(this, `Param${name.replace(/[^A-Za-z0-9]/g, '')}`, {
        parameterName: `/mosaiclife/lean/rds/${name}`,
        stringValue: value,
        description,
      });
    publish('endpoint', this.instance.dbInstanceEndpointAddress, 'Lean RDS endpoint hostname');
    publish('port', this.instance.dbInstanceEndpointPort, 'Lean RDS port');
    publish('clients-sg-id', this.clientsSecurityGroup.securityGroupId, 'mosaic-db-clients security group ID');
    publish('db-sg-id', dbSecurityGroup.securityGroupId, 'Lean RDS security group ID');
    publish('master-secret-arn', masterSecret.secretArn, 'Master credentials secret ARN');

    if (props.dbCopy) {
      this.addDbCopy(vpc, masterSecret, props.auroraSecurityGroupId);
    }
  }

  /**
   * Temporary db-copy tooling (Aurora -> RDS). Removed by dropping `-c dbCopy=true`.
   * One task definition per source environment; destination database and role default
   * to the env's own and can be overridden at run-task time (e.g. DST_DB=core_copytest).
   */
  private addDbCopy(vpc: ec2.IVpc, masterSecret: secretsmanager.ISecret, auroraSecurityGroupId?: string): void {
    const script = fs.readFileSync(path.join(__dirname, '../../scripts/db-copy.sh'), 'utf8');

    // Names match the deploy role's iam:PassRole scope `role/mosaic-*-ecs-*`.
    const executionRole = new iam.Role(this, 'DbCopyExecutionRole', {
      roleName: 'mosaic-shared-ecs-execution-dbcopy',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    const taskRole = new iam.Role(this, 'DbCopyTaskRole', {
      roleName: 'mosaic-shared-ecs-task-dbcopy',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    const logGroup = new logs.LogGroup(this, 'DbCopyLogGroup', {
      logGroupName: '/mosaic/shared/db-copy',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // Own cluster so db-copy does not depend on the shared `mosaic` cluster (group 7).
    const cluster = new ecs.Cluster(this, 'DbCopyCluster', { clusterName: 'mosaic-db-copy', vpc });

    const sources = [
      { env: 'prod', dstDb: 'core', dstRole: 'mosaic_prod' },
      { env: 'staging', dstDb: 'core_staging', dstRole: 'mosaic_staging' },
    ];
    for (const { env, dstDb, dstRole } of sources) {
      const src = secretsmanager.Secret.fromSecretNameV2(this, `SrcSecret-${env}`, `mosaic/${env}/rds/credentials`);
      const taskDef = new ecs.FargateTaskDefinition(this, `DbCopyTaskDef-${env}`, {
        family: `mosaic-${env}-db-copy`,
        cpu: 512,
        memoryLimitMiB: 1024,
        executionRole,
        taskRole,
        runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
      });
      taskDef.addContainer('db-copy', {
        image: ecs.ContainerImage.fromRegistry('postgres:16-alpine'),
        entryPoint: ['sh', '-c'],
        command: [script],
        logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: env }),
        environment: { DST_DB: dstDb, DST_ROLE: dstRole },
        secrets: {
          SRC_HOST: ecs.Secret.fromSecretsManager(src, 'host'),
          SRC_PORT: ecs.Secret.fromSecretsManager(src, 'port'),
          SRC_USER: ecs.Secret.fromSecretsManager(src, 'username'),
          SRC_PASSWORD: ecs.Secret.fromSecretsManager(src, 'password'),
          SRC_DB: ecs.Secret.fromSecretsManager(src, 'dbname'),
          DST_HOST: ecs.Secret.fromSecretsManager(masterSecret, 'host'),
          DST_PORT: ecs.Secret.fromSecretsManager(masterSecret, 'port'),
          DST_USER: ecs.Secret.fromSecretsManager(masterSecret, 'username'),
          DST_PASSWORD: ecs.Secret.fromSecretsManager(masterSecret, 'password'),
        },
      });
    }

    // Aurora's SG already admits the VPC CIDR; this explicit rule is the documented,
    // removable path (group 13.3) for the db-copy tasks.
    if (auroraSecurityGroupId) {
      new ec2.CfnSecurityGroupIngress(this, 'AuroraFromDbClients', {
        groupId: auroraSecurityGroupId,
        sourceSecurityGroupId: this.clientsSecurityGroup.securityGroupId,
        ipProtocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        description: 'Temporary: db-copy tasks (mosaic-db-clients) to Aurora',
      });
    }

    new cdk.CfnOutput(this, 'DbCopyClusterName', { value: cluster.clusterName });
  }
}
