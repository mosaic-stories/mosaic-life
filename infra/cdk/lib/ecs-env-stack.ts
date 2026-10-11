import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { loadRuntimeEnv } from './config/runtime-env';
import { grantCoreApiPermissions } from './constructs/core-api-permissions';
import { LeanObservability } from './constructs/lean-observability';
import { ECS_CLUSTER_NAME, ECS_SSM_PREFIX, publicSubnets } from './ecs-shared-stack';

export type RuntimeEnvironment = 'prod' | 'staging';

export interface EcsEnvStackProps extends cdk.StackProps {
  /** Named `environment` because `env` is taken by StackProps (account/region). */
  environment: RuntimeEnvironment;
  vpc: ec2.IVpc;
  /** Create the Route53 alias records (only after external-dns's records are removed). Default false. */
  manageDns?: boolean;
}

const HOSTED_ZONE_ID = 'Z039487930F6987CJO4W9';
const ZONE_NAME = 'mosaiclife.me';

/** Listener-rule hosts per environment. Priorities: prod 100-199, staging 200-299. */
const ROUTING = {
  prod: {
    basePriority: 100,
    dnsNames: ['mosaiclife.me', 'frontend.mosaiclife.me', 'api.mosaiclife.me', 'backend.mosaiclife.me'],
    appHosts: ['mosaiclife.me', 'frontend.mosaiclife.me'],
    apiHosts: ['api.mosaiclife.me', 'backend.mosaiclife.me'],
  },
  staging: {
    basePriority: 200,
    dnsNames: ['stage.mosaiclife.me', 'stage-api.mosaiclife.me'],
    appHosts: ['stage.mosaiclife.me'],
    apiHosts: ['stage-api.mosaiclife.me'],
  },
} as const;
/** Paths the ALB sends straight to core-api on the app hosts (design D2, Option A). */
const CORE_API_PATHS = ['/api/*', '/healthz', '/readyz', '/sitemap.xml', '/robots.txt'];

const FARGATE_PLATFORM: ecs.RuntimePlatform = {
  cpuArchitecture: ecs.CpuArchitecture.X86_64,
  operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
};

/**
 * Per-environment ECS runtime (design D1-D3, D9-D10): log groups, roles, task definitions,
 * services, target groups and listener rules on the shared ALB. `MosaicEcsRuntimeStack-{prod,staging}`.
 * Only instantiated with `-c leanRuntime=true`.
 *
 * PRECONDITION: SSM parameter `/mosaiclife/{env}/image-tag` must exist before the first deploy
 * (the operator seeds it with an image tag already in ECR). The release workflow owns it afterwards,
 * so a later `cdk deploy` never reverts a release.
 */
export class EcsEnvStack extends cdk.Stack {
  public readonly coreApiService: ecs.FargateService;
  public readonly webService: ecs.FargateService;
  public readonly coreApiTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly webTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly coreApiLogGroup: logs.LogGroup;
  public readonly webLogGroup: logs.LogGroup;
  public readonly clusterName: string;

  constructor(scope: Construct, id: string, props: EcsEnvStackProps) {
    super(scope, id, props);
    const { environment: envName, vpc } = props;
    const isProd = envName === 'prod';
    const cfg = loadRuntimeEnv(envName);
    const routing = ROUTING[envName];
    const ssmValue = (name: string) => ssm.StringParameter.valueForStringParameter(this, name);

    // --- Shared edge, read from SSM (no Fn::ImportValue) --------------------
    this.clusterName = ssmValue(`${ECS_SSM_PREFIX}/cluster-name`);
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: this.clusterName,
      vpc,
      securityGroups: [],
    });
    const albSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSg', ssmValue(`${ECS_SSM_PREFIX}/alb-sg-id`));
    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'HttpsListener', {
      listenerArn: ssmValue(`${ECS_SSM_PREFIX}/https-listener-arn`),
      securityGroup: albSg,
    });
    const alb = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'Alb', {
      loadBalancerArn: ssmValue(`${ECS_SSM_PREFIX}/alb-arn`),
      loadBalancerDnsName: ssmValue(`${ECS_SSM_PREFIX}/alb-dns-name`),
      loadBalancerCanonicalHostedZoneId: ssmValue(`${ECS_SSM_PREFIX}/alb-hosted-zone-id`),
      securityGroupId: ssmValue(`${ECS_SSM_PREFIX}/alb-sg-id`),
    });
    const dbClientsSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'DbClientsSg',
      ssmValue('/mosaiclife/lean/rds/clients-sg-id'),
    );

    // --- Logs ----------------------------------------------------------------
    const logGroup = (service: string) =>
      new logs.LogGroup(this, `LogGroup-${service}`, {
        logGroupName: `/mosaic/${envName}/${service}`,
        retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
        removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });
    this.coreApiLogGroup = logGroup('core-api');
    this.webLogGroup = logGroup('web');
    const migrateLogGroup = logGroup('migrate');

    // --- Roles (names match the deploy role's iam:PassRole scope `role/mosaic-*-ecs-*`) ---
    const ecsTasks = new iam.ServicePrincipal('ecs-tasks.amazonaws.com');
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      roleName: `mosaic-${envName}-ecs-execution`,
      assumedBy: ecsTasks,
    });
    const coreApiTaskRole = new iam.Role(this, 'CoreApiTaskRole', {
      roleName: `mosaic-${envName}-ecs-task-core-api`,
      assumedBy: ecsTasks,
    });
    const webTaskRole = new iam.Role(this, 'WebTaskRole', {
      roleName: `mosaic-${envName}-ecs-task-web`,
      assumedBy: ecsTasks,
    });
    const coreEnv = cfg.coreApi.env;
    // Secrets are injected by the execution role, so the task role needs no secrets read.
    grantCoreApiPermissions(coreApiTaskRole, {
      environment: envName,
      account: this.account,
      region: this.region,
      mediaBucket: s3.Bucket.fromBucketName(this, 'MediaBucket', coreEnv.S3_MEDIA_BUCKET),
      backupBucket: s3.Bucket.fromBucketName(this, 'BackupBucket', coreEnv.S3_BACKUP_BUCKET),
      guardrailArn: `arn:aws:bedrock:${this.region}:${this.account}:guardrail/${coreEnv.BEDROCK_GUARDRAIL_ID}`,
      includeSecretsRead: false,
    });

    // --- Task security group: 8080 from the ALB only -------------------------
    const taskSg = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc,
      securityGroupName: `mosaic-${envName}-tasks`,
      description: `ECS tasks (${envName}): 8080 from the shared ALB only`,
    });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(8080), 'From the shared ALB');

    // --- Task definitions ----------------------------------------------------
    // Image tag is read at deploy time from SSM; the release workflow registers new revisions.
    const tag = ssmValue(`/mosaiclife/${envName}/image-tag`);
    const coreImage = ecs.ContainerImage.fromEcrRepository(
      ecr.Repository.fromRepositoryName(this, 'CoreApiRepo', 'mosaic-life/core-api'),
      tag,
    );
    const webImage = ecs.ContainerImage.fromEcrRepository(
      ecr.Repository.fromRepositoryName(this, 'WebRepo', 'mosaic-life/web'),
      tag,
    );
    const secretResources = new Map<string, secretsmanager.ISecret>();
    const secrets: Record<string, ecs.Secret> = {};
    for (const [envVar, ref] of Object.entries(cfg.secrets)) {
      if (!secretResources.has(ref.secret)) {
        secretResources.set(
          ref.secret,
          secretsmanager.Secret.fromSecretNameV2(this, `Secret${secretResources.size}`, ref.secret),
        );
      }
      secrets[envVar] = ecs.Secret.fromSecretsManager(secretResources.get(ref.secret)!, ref.key);
    }

    /** Fargate task definition with a read-only root filesystem and ephemeral writable volumes (mirrors Helm). */
    const addTask = (
      key: string,
      family: string,
      cpu: number,
      memoryLimitMiB: number,
      taskRole: iam.IRole,
      container: {
        name: string;
        image: ecs.ContainerImage;
        group: logs.ILogGroup;
        streamPrefix: string;
        environment: Record<string, string>;
        secrets?: Record<string, ecs.Secret>;
        command?: string[];
        port?: boolean;
        mounts: Record<string, string>; // volume name -> container path
      },
    ): ecs.FargateTaskDefinition => {
      const td = new ecs.FargateTaskDefinition(this, key, {
        family,
        cpu,
        memoryLimitMiB,
        taskRole,
        executionRole,
        runtimePlatform: FARGATE_PLATFORM,
      });
      const c = td.addContainer(container.name, {
        image: container.image,
        essential: true,
        environment: container.environment,
        secrets: container.secrets,
        command: container.command,
        portMappings: container.port ? [{ containerPort: 8080, protocol: ecs.Protocol.TCP }] : undefined,
        stopTimeout: cdk.Duration.seconds(120),
        readonlyRootFilesystem: true,
        logging: ecs.LogDrivers.awsLogs({ logGroup: container.group, streamPrefix: container.streamPrefix }),
      });
      for (const [volume, containerPath] of Object.entries(container.mounts)) {
        td.addVolume({ name: volume });
        c.addMountPoints({ sourceVolume: volume, containerPath, readOnly: false });
      }
      return td;
    };
    // ECS Exec's SSM agent writes under these paths, which a read-only root filesystem would block.
    const execMounts = { 'ssm-lib': '/var/lib/amazon', 'ssm-log': '/var/log/amazon' };
    // NOTE: containers run as the image default user (no `user` override). Helm forces uid 1000 via
    // fsGroup; ECS has no fsGroup, so root-owned ephemeral volumes would be unwritable for uid 1000.
    // The root filesystem stays read-only; only the mounted volumes are writable.
    const coreApiTaskDef = addTask('CoreApiTaskDef', `mosaic-${envName}-core-api`, 512, 1024, coreApiTaskRole, {
      name: 'core-api',
      image: coreImage,
      group: this.coreApiLogGroup,
      streamPrefix: 'core-api',
      environment: coreEnv,
      secrets,
      port: true,
      mounts: { tmp: '/tmp', ...execMounts },
    });
    const webTaskDef = addTask('WebTaskDef', `mosaic-${envName}-web`, 256, 512, webTaskRole, {
      name: 'web',
      image: webImage,
      group: this.webLogGroup,
      streamPrefix: 'web',
      environment: cfg.web.env,
      port: true,
      mounts: {
        tmp: '/tmp',
        'nginx-cache': '/var/cache/nginx',
        'nginx-run': '/var/run',
        'nginx-conf': '/etc/nginx/conf.d',
        ...execMounts,
      },
    });
    // Run by the release workflow with `aws ecs run-task` (container name matches core-api: ecs-deploy.sh reads its exit code).
    addTask('MigrateTaskDef', `mosaic-${envName}-migrate`, 256, 512, coreApiTaskRole, {
      name: 'core-api',
      image: coreImage,
      group: migrateLogGroup,
      streamPrefix: 'migrate',
      environment: coreEnv,
      secrets,
      command: ['alembic', 'upgrade', 'head'],
      mounts: { tmp: '/tmp' },
    });

    // --- Target groups -------------------------------------------------------
    const targetGroup = (key: string, healthPath: string) =>
      new elbv2.ApplicationTargetGroup(this, key, {
        vpc,
        targetType: elbv2.TargetType.IP,
        protocol: elbv2.ApplicationProtocol.HTTP,
        port: 8080,
        deregistrationDelay: cdk.Duration.seconds(120),
        healthCheck: {
          path: healthPath,
          healthyThresholdCount: 2,
          interval: cdk.Duration.seconds(15),
          timeout: cdk.Duration.seconds(5),
        },
      });
    this.coreApiTargetGroup = targetGroup('CoreApiTargetGroup', '/healthz');
    this.webTargetGroup = targetGroup('WebTargetGroup', '/');

    // --- Services ------------------------------------------------------------
    const subnets = publicSubnets(this);
    const addService = (
      key: string,
      service: 'core-api' | 'web',
      taskDefinition: ecs.FargateTaskDefinition,
      capacityProvider: 'FARGATE' | 'FARGATE_SPOT',
      group: elbv2.ApplicationTargetGroup,
      extraSgs: ec2.ISecurityGroup[],
    ) => {
      const svc = new ecs.FargateService(this, key, {
        serviceName: `mosaic-${envName}-${service}`,
        cluster,
        taskDefinition,
        // Staging starts at 0 (scale-to-zero, design D6); prod omits it so CloudFormation uses the
        // default of 1 on create and never touches the live count afterwards.
        desiredCount: isProd ? undefined : 0,
        capacityProviderStrategies: [{ capacityProvider, weight: 1 }],
        vpcSubnets: { subnets },
        assignPublicIp: true,
        securityGroups: [taskSg, ...extraSgs],
        circuitBreaker: { rollback: true },
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        enableExecuteCommand: true,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
      });
      svc.attachToApplicationTargetGroup(group);
      return svc;
    };
    this.coreApiService = addService('CoreApiService', 'core-api', coreApiTaskDef, 'FARGATE', this.coreApiTargetGroup, [dbClientsSg]);
    this.webService = addService('WebService', 'web', webTaskDef, 'FARGATE_SPOT', this.webTargetGroup, []);

    // --- Listener rules (design D2) -------------------------------------------
    const rule = (key: string, offset: number, conditions: elbv2.ListenerCondition[], group: elbv2.ApplicationTargetGroup) =>
      new elbv2.ApplicationListenerRule(this, key, {
        listener,
        priority: routing.basePriority + offset,
        conditions,
        action: elbv2.ListenerAction.forward([group]),
      });
    const appHosts = elbv2.ListenerCondition.hostHeaders([...routing.appHosts]);
    rule('CoreApiAppPathsRule', 0, [appHosts, elbv2.ListenerCondition.pathPatterns(CORE_API_PATHS)], this.coreApiTargetGroup);
    rule('CoreApiHostsRule', 10, [elbv2.ListenerCondition.hostHeaders([...routing.apiHosts])], this.coreApiTargetGroup);
    rule('WebHostsRule', 90, [appHosts], this.webTargetGroup);

    // --- DNS (cutover step: enable with -c manageDns=<env>[,<env>] after external-dns records are gone) ---
    if (props.manageDns) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: HOSTED_ZONE_ID,
        zoneName: ZONE_NAME,
      });
      routing.dnsNames.forEach((name, i) => {
        new route53.ARecord(this, `Alias${i}`, {
          zone,
          recordName: name,
          target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(alb)),
        });
      });
    }

    // --- Observability (design D9) ---------------------------------------------
    new LeanObservability(this, 'Observability', {
      env: envName,
      // The operator seeds /mosaiclife/lean/alarm-email (String) before the first prod deploy; the
      // address is deliberately not in this public repo. Staging has no alarms, so it is unused there.
      alarmEmail: isProd ? ssmValue('/mosaiclife/lean/alarm-email') : 'unused@example.invalid',
      enableAlarms: isProd,
      loadBalancer: alb,
      coreApiTargetGroup: this.coreApiTargetGroup,
      webTargetGroup: this.webTargetGroup,
      coreApiService: { clusterName: this.clusterName, serviceName: this.coreApiService.serviceName },
      webService: { clusterName: this.clusterName, serviceName: this.webService.serviceName },
      dbInstanceIdentifier: 'mosaic-lean-db',
      coreApiLogGroup: this.coreApiLogGroup,
      webLogGroup: this.webLogGroup,
    });

    if (!isProd) this.addNightlyStopBackstop();
  }

  /**
   * Staging backstop (design D6, task 10.1): stop both services nightly at 03:00 UTC. The one-time
   * auto-stop schedules created by the staging workflows live in the same group
   * (`staging-autostop.sh` assumes group `mosaic-staging` and this role's name).
   */
  private addNightlyStopBackstop(): void {
    const groupName = 'mosaic-staging';
    const group = new scheduler.CfnScheduleGroup(this, 'ScheduleGroup', { name: groupName });
    const role = new iam.Role(this, 'SchedulerRole', {
      roleName: 'mosaic-staging-ecs-scheduler',
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    const services = [this.coreApiService, this.webService];
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecs:UpdateService'],
        resources: services.map((s) => s.serviceArn),
      }),
    );
    for (const svc of ['core-api', 'web']) {
      const schedule = new scheduler.CfnSchedule(this, `NightlyStop-${svc}`, {
        name: `staging-nightly-stop-${svc}`,
        groupName,
        scheduleExpression: 'cron(0 3 * * ? *)',
        scheduleExpressionTimezone: 'UTC',
        flexibleTimeWindow: { mode: 'OFF' },
        target: {
          arn: 'arn:aws:scheduler:::aws-sdk:ecs:updateService',
          roleArn: role.roleArn,
          input: JSON.stringify({ Cluster: ECS_CLUSTER_NAME, Service: `mosaic-staging-${svc}`, DesiredCount: 0 }),
        },
      });
      schedule.addDependency(group);
    }
  }
}
