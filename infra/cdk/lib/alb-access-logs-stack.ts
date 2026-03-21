import * as cdk from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import { Construct } from 'constructs';

interface AlbAccessLogsStackProps extends cdk.StackProps {
  /**
   * S3 bucket where ALB access logs are stored.
   */
  logsBucket: string;

  /**
   * S3 bucket + prefix for Athena query results.
   */
  athenaResultsLocation: string;

  /**
   * AWS account ID (used in S3 path structure).
   */
  accountId: string;

  /**
   * AWS region (used in S3 path structure).
   */
  region: string;

  /**
   * Shared S3 prefix for ALB access logs.
   */
  logsPrefix: string;

  /**
   * Start date for partition projection range (yyyy/MM/dd format).
   */
  projectionStartDate: string;
}

export class AlbAccessLogsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AlbAccessLogsStackProps) {
    super(scope, id, props);

    // Glue Database
    const database = new glue.CfnDatabase(this, 'AlbLogsDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'mosaic_life_alb_logs',
        description: 'ALB access logs for Mosaic Life load balancers',
      },
    });

    // Athena WorkGroup
    new athena.CfnWorkGroup(this, 'AlbLogsWorkGroup', {
      name: 'mosaic-life-alb-logs',
      description: 'Workgroup for querying ALB access logs',
      state: 'ENABLED',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: props.athenaResultsLocation,
        },
        enforceWorkGroupConfiguration: false,
        publishCloudWatchMetricsEnabled: true,
        engineVersion: {
          selectedEngineVersion: 'Athena engine version 3',
        },
      },
      tags: [
        { key: 'Project', value: 'MosaicLife' },
        { key: 'ManagedBy', value: 'CDK' },
        { key: 'Component', value: 'Observability' },
      ],
    });

    // RegexSerDe input regex for ALB access logs
    const albLogRegex = '([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*)[:-]([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-.0-9]*) (|[-0-9]*) (-|[-0-9]*) ([-0-9]*) ([-0-9]*) \\"([^ ]*) (.*) (- |[^ ]*)\\" \\"([^\\"]*)\\" ([A-Z0-9-_]+) ([A-Za-z0-9.-]*) ([^ ]*) \\"([^\\"]*)\\" \\"([^\\"]*)\\" \\"([^\\"]*)\\" ([-.0-9]*) ([^ ]*) \\"([^\\"]*)\\" \\"([^\\"]*)\\" \\"([^ ]*)\\" \\"([^\\\\s]+?)\\" \\"([^\\\\s]+)\\" \\"([^ ]*)\\" \\"([^ ]*)\\" ?([^ ]*)? ?( .*)?';

    // Column definitions for ALB access logs
    const columns: glue.CfnTable.ColumnProperty[] = [
      { name: 'type', type: 'string' },
      { name: 'time', type: 'string' },
      { name: 'elb', type: 'string' },
      { name: 'client_ip', type: 'string' },
      { name: 'client_port', type: 'int' },
      { name: 'target_ip', type: 'string' },
      { name: 'target_port', type: 'int' },
      { name: 'request_processing_time', type: 'double' },
      { name: 'target_processing_time', type: 'double' },
      { name: 'response_processing_time', type: 'double' },
      { name: 'elb_status_code', type: 'int' },
      { name: 'target_status_code', type: 'string' },
      { name: 'received_bytes', type: 'bigint' },
      { name: 'sent_bytes', type: 'bigint' },
      { name: 'request_verb', type: 'string' },
      { name: 'request_url', type: 'string' },
      { name: 'request_proto', type: 'string' },
      { name: 'user_agent', type: 'string' },
      { name: 'ssl_cipher', type: 'string' },
      { name: 'ssl_protocol', type: 'string' },
      { name: 'target_group_arn', type: 'string' },
      { name: 'trace_id', type: 'string' },
      { name: 'domain_name', type: 'string' },
      { name: 'chosen_cert_arn', type: 'string' },
      { name: 'matched_rule_priority', type: 'string' },
      { name: 'request_creation_time', type: 'string' },
      { name: 'actions_executed', type: 'string' },
      { name: 'redirect_url', type: 'string' },
      { name: 'lambda_error_reason', type: 'string' },
      { name: 'target_port_list', type: 'string' },
      { name: 'target_status_code_list', type: 'string' },
      { name: 'classification', type: 'string' },
      { name: 'classification_reason', type: 'string' },
      { name: 'conn_trace_id', type: 'string' },
    ];

    const s3Location = `s3://${props.logsBucket}/${props.logsPrefix}/AWSLogs/${props.accountId}/elasticloadbalancing/${props.region}/`;
    const storageLocationTemplate = `s3://${props.logsBucket}/${props.logsPrefix}/AWSLogs/${props.accountId}/elasticloadbalancing/${props.region}/\${day}`;

    const table = new glue.CfnTable(this, 'AlbLogsTable', {
      catalogId: this.account,
      databaseName: 'mosaic_life_alb_logs',
      tableInput: {
        name: 'access_logs',
        description: 'ALB access logs for the shared Mosaic Life load balancer',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'projection.enabled': 'true',
          'projection.day.type': 'date',
          'projection.day.range': `${props.projectionStartDate},NOW`,
          'projection.day.format': 'yyyy/MM/dd',
          'projection.day.interval': '1',
          'projection.day.interval.unit': 'DAYS',
          'storage.location.template': storageLocationTemplate,
        },
        partitionKeys: [{ name: 'day', type: 'string' }],
        storageDescriptor: {
          columns,
          location: s3Location,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.apache.hadoop.hive.serde2.RegexSerDe',
            parameters: {
              'serialization.format': '1',
              'input.regex': albLogRegex,
            },
          },
        },
      },
    });

    table.addDependency(database);

    cdk.Tags.of(this).add('Project', 'MosaicLife');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'Observability');
  }
}
