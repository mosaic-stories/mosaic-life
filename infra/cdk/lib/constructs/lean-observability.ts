import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

/** Names of an ECS service, for the AWS/ECS ClusterName/ServiceName dimensions. */
export interface EcsServiceRef {
  clusterName: string;
  serviceName: string;
}

export interface LeanObservabilityProps {
  env: 'prod' | 'staging';
  /** Recipient of alarm emails. */
  alarmEmail: string;
  /** Create the SNS topic and the alarms (true for prod, false for staging). */
  enableAlarms: boolean;
  /** Shared ALB; metrics are keyed on its full name. */
  loadBalancer: elbv2.IApplicationLoadBalancer;
  coreApiTargetGroup: elbv2.IApplicationTargetGroup;
  webTargetGroup: elbv2.IApplicationTargetGroup;
  coreApiService: EcsServiceRef;
  webService: EcsServiceRef;
  /** RDS DBInstanceIdentifier, e.g. `mosaic-lean-db`. */
  dbInstanceIdentifier: string;
  coreApiLogGroup: logs.ILogGroup;
  webLogGroup: logs.ILogGroup;
}

const FIVE_MIN = cdk.Duration.minutes(5);

/**
 * CloudWatch-only observability for the lean ECS runtime (design D9):
 * SNS topic + 9 alarms (prod), AppErrorCount metric filter, dashboard and
 * saved Logs Insights queries.
 */
export class LeanObservability extends Construct {
  public readonly alarmTopic?: sns.Topic;
  public readonly appErrorCount: cloudwatch.Metric;

  constructor(scope: Construct, id: string, props: LeanObservabilityProps) {
    super(scope, id);
    const { env } = props;
    const ns = `Mosaic/${env}`;

    // --- Log metric filter -------------------------------------------------
    new logs.MetricFilter(this, 'AppErrorFilter', {
      logGroup: props.coreApiLogGroup,
      metricNamespace: ns,
      metricName: 'AppErrorCount',
      filterPattern: logs.FilterPattern.literal('{ $.levelname = "ERROR" }'),
      metricValue: '1',
      defaultValue: 0,
    });
    this.appErrorCount = new cloudwatch.Metric({
      namespace: ns,
      metricName: 'AppErrorCount',
      statistic: 'Sum',
      period: FIVE_MIN,
    });

    // --- Metrics -----------------------------------------------------------
    // The interfaces don't expose full names, so derive them from the ARNs
    // (works for owned and imported resources alike).
    const lbDim = {
      LoadBalancer: cdk.Fn.select(1, cdk.Fn.split('loadbalancer/', props.loadBalancer.loadBalancerArn)),
    };
    const alb = (metricName: string, statistic: string, extra: cloudwatch.MetricOptions = {}) =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName,
        dimensionsMap: lbDim,
        statistic,
        period: FIVE_MIN,
        ...extra,
      });
    const tg = (group: elbv2.IApplicationTargetGroup, metricName: string, statistic: string) =>
      alb(metricName, statistic, {
        dimensionsMap: { ...lbDim, TargetGroup: cdk.Fn.select(5, cdk.Fn.split(':', group.targetGroupArn)) },
      });
    const ecs = (svc: EcsServiceRef, metricName: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName,
        dimensionsMap: { ClusterName: svc.clusterName, ServiceName: svc.serviceName },
        statistic: 'Average',
        period: FIVE_MIN,
      });
    const rds = (metricName: string, statistic = 'Average') =>
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName,
        dimensionsMap: { DBInstanceIdentifier: props.dbInstanceIdentifier },
        statistic,
        period: FIVE_MIN,
      });

    const coreHealthy = tg(props.coreApiTargetGroup, 'HealthyHostCount', 'Minimum');
    const webHealthy = tg(props.webTargetGroup, 'HealthyHostCount', 'Minimum');
    const elb5xx = alb('HTTPCode_ELB_5XX_Count', 'Sum');
    const target5xx = tg(props.coreApiTargetGroup, 'HTTPCode_Target_5XX_Count', 'Sum');
    const p95 = tg(props.coreApiTargetGroup, 'TargetResponseTime', 'p95');
    const rdsCpu = rds('CPUUtilization');
    const rdsStorage = rds('FreeStorageSpace', 'Minimum');
    const rdsMemory = rds('FreeableMemory', 'Minimum');

    // --- Alarms ------------------------------------------------------------
    if (props.enableAlarms) {
      const topic = new sns.Topic(this, 'AlertsTopic', { topicName: `mosaic-${env}-alerts` });
      topic.addSubscription(new subs.EmailSubscription(props.alarmEmail));
      this.alarmTopic = topic;

      const alarm = (
        key: string,
        description: string,
        metric: cloudwatch.IMetric,
        threshold: number,
        op: cloudwatch.ComparisonOperator,
        evaluationPeriods: number,
        missing = cloudwatch.TreatMissingData.NOT_BREACHING,
      ) => {
        const a = new cloudwatch.Alarm(this, key, {
          alarmName: `mosaic-${env}-${key}`,
          alarmDescription: description,
          metric,
          threshold,
          comparisonOperator: op,
          evaluationPeriods,
          treatMissingData: missing,
        });
        a.addAlarmAction(new cw_actions.SnsAction(topic));
        a.addOkAction(new cw_actions.SnsAction(topic));
      };
      const LT = cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD;
      const GTE = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;
      const GT = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD;
      const BREACHING = cloudwatch.TreatMissingData.BREACHING;

      alarm('core-api-no-healthy-targets', 'core-api has no healthy targets for 5 min', coreHealthy, 1, LT, 5, BREACHING);
      alarm('web-no-healthy-targets', 'web has no healthy targets for 5 min', webHealthy, 1, LT, 5, BREACHING);
      alarm('alb-5xx', 'ALB-generated 5xx >= 10 in 5 min', elb5xx, 10, GTE, 1);
      alarm('target-5xx', 'core-api target 5xx >= 10 in 5 min', target5xx, 10, GTE, 1);
      alarm('slow-responses', 'core-api p95 response time > 3 s for 15 min', p95, 3, GT, 3);
      alarm('rds-cpu', 'RDS CPU > 80% for 15 min', rdsCpu, 80, GT, 3);
      alarm('rds-free-storage', 'RDS free storage < 2 GB', rdsStorage, 2 * 1024 ** 3, LT, 1);
      alarm('rds-freeable-memory', 'RDS freeable memory < 100 MB for 15 min', rdsMemory, 100 * 1024 ** 2, LT, 3);
      alarm('app-errors', 'Application ERROR logs >= 20 in 5 min', this.appErrorCount, 20, GTE, 1);
    }

    // --- Dashboard ---------------------------------------------------------
    const errorsQuery =
      'fields @timestamp, name, message | filter levelname = "ERROR" | sort @timestamp desc | limit 50';
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', { dashboardName: `mosaic-${env}` });
    const graph = (title: string, left: cloudwatch.IMetric[], width = 12) =>
      new cloudwatch.GraphWidget({ title, left, width, height: 6 });
    dashboard.addWidgets(
      graph('ALB requests and 5xx', [alb('RequestCount', 'Sum'), elb5xx, target5xx]),
      graph('core-api p95 latency (s)', [p95]),
      graph('Healthy hosts', [coreHealthy, webHealthy]),
      graph('App errors', [this.appErrorCount]),
      graph('ECS CPU %', [ecs(props.coreApiService, 'CPUUtilization'), ecs(props.webService, 'CPUUtilization')]),
      graph('ECS memory %', [ecs(props.coreApiService, 'MemoryUtilization'), ecs(props.webService, 'MemoryUtilization')]),
      graph('RDS CPU %', [rdsCpu]),
      graph('RDS connections', [rds('DatabaseConnections')]),
      graph('RDS free storage', [rdsStorage]),
      graph('RDS freeable memory', [rdsMemory]),
      new cloudwatch.LogQueryWidget({
        title: 'Recent errors',
        logGroupNames: [props.coreApiLogGroup.logGroupName],
        queryString: errorsQuery,
        width: 24,
        height: 6,
      }),
    );

    // --- Saved Logs Insights queries ---------------------------------------
    // Replace REQUEST_ID before running. Matches the application `request_id`
    // field (set via `extra=`) and the OTel `trace_id` added to every line.
    new logs.CfnQueryDefinition(this, 'RequestByIdQuery', {
      name: `mosaic-${env}/request-by-id`,
      logGroupNames: [props.coreApiLogGroup.logGroupName],
      queryString: [
        'fields @timestamp, levelname, name, message, request_id, trace_id, @message',
        'filter request_id = "REQUEST_ID" or trace_id = "REQUEST_ID"',
        'sort @timestamp asc',
        'limit 200',
      ].join('\n| '),
    });
    new logs.CfnQueryDefinition(this, 'ErrorsLastHourQuery', {
      name: `mosaic-${env}/errors-last-hour`,
      logGroupNames: [props.coreApiLogGroup.logGroupName],
      queryString: [
        'fields @timestamp, name, message, request_id, trace_id',
        'filter levelname = "ERROR"',
        'sort @timestamp desc',
        'limit 100',
      ].join('\n| '),
    });
  }
}
