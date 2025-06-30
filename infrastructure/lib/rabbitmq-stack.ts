import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as mq from 'aws-cdk-lib/aws-amazonmq';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

interface RabbitMQStackProps extends cdk.StackProps {
  envName?: string;
  vpc: ec2.Vpc;
  alertEmail?: string;
}

export class RabbitMQStack extends cdk.Stack {
  public readonly brokerEndpoint: string;
  public readonly brokerSecret: secretsmanager.Secret;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RabbitMQStackProps) {
    super(scope, id, props);

    const environment = props.envName || 'dev';
    const isProduction = environment === 'prod';

    // Create secrets for RabbitMQ credentials
    this.brokerSecret = new secretsmanager.Secret(this, 'RabbitMQSecret', {
      secretName: `bookmarkai/${environment}/rabbitmq`,
      description: 'RabbitMQ broker credentials for BookmarkAI ML services',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'ml',
        }),
        generateStringKey: 'password',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        passwordLength: 32,
      },
    });

    // Create security group for RabbitMQ
    this.securityGroup = new ec2.SecurityGroup(this, 'RabbitMQSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for BookmarkAI RabbitMQ broker',
      allowAllOutbound: true,
    });

    // Allow AMQPS traffic from within VPC
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5671),
      'Allow AMQPS from VPC'
    );

    // Allow management console access (HTTPS) from within VPC
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow RabbitMQ management console from VPC'
    );

    // Create CloudWatch log group for RabbitMQ logs
    const logGroup = new logs.LogGroup(this, 'RabbitMQLogs', {
      logGroupName: `/aws/amazonmq/broker/bookmarkai-${environment}`,
      retention: isProduction ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Define broker configuration
    const brokerConfiguration = new mq.CfnConfiguration(this, 'RabbitMQConfiguration', {
      name: `bookmarkai-rabbitmq-config-${environment}`,
      description: 'RabbitMQ configuration for BookmarkAI ML services',
      engineType: 'RABBITMQ',
      engineVersion: '3.13',
      data: cdk.Fn.base64(this.getRabbitMQConfiguration()),
    });

    // Create Amazon MQ broker
    const broker = new mq.CfnBroker(this, 'RabbitMQBroker', {
      brokerName: `bookmarkai-rabbitmq-${environment}`,
      deploymentMode: isProduction ? 'CLUSTER_MULTI_AZ' : 'SINGLE_INSTANCE',
      engineType: 'RABBITMQ',
      engineVersion: '3.13',
      hostInstanceType: isProduction ? 'mq.m5.large' : 'mq.t3.micro',
      publiclyAccessible: false,
      autoMinorVersionUpgrade: true,
      
      // User configuration
      users: [{
        username: 'ml',
        password: this.brokerSecret.secretValueFromJson('password').unsafeUnwrap(),
        groups: ['admin'],
      }],

      // Network configuration
      subnetIds: isProduction 
        ? props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds
        : [props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds[0]],
      securityGroups: [this.securityGroup.securityGroupId],

      // Configuration
      configuration: {
        id: brokerConfiguration.ref,
        revision: brokerConfiguration.attrRevision,
      },

      // Logs
      logs: {
        general: true,
      },

      // Maintenance window
      maintenanceWindowStartTime: {
        dayOfWeek: 'SUNDAY',
        timeOfDay: '02:00',
        timeZone: 'UTC',
      },

      // Storage
      storageType: 'EBS',
    });

    // Store the broker endpoint
    this.brokerEndpoint = broker.attrAmqpEndpoints.toString();

    // Create SNS topic for alerts (if email provided)
    let alarmTopic: sns.Topic | undefined;
    if (props.alertEmail) {
      alarmTopic = new sns.Topic(this, 'RabbitMQAlarmTopic', {
        displayName: `BookmarkAI RabbitMQ Alerts (${environment})`,
      });

      new sns.Subscription(this, 'EmailSubscription', {
        protocol: sns.SubscriptionProtocol.EMAIL,
        topic: alarmTopic,
        endpoint: props.alertEmail,
      });
    }

    // Create CloudWatch alarms
    this.createCloudWatchAlarms(broker, alarmTopic);

    // Create outputs
    new cdk.CfnOutput(this, 'BrokerEndpoint', {
      value: this.brokerEndpoint,
      description: 'RabbitMQ broker AMQPS endpoint',
      exportName: `${this.stackName}-BrokerEndpoint`,
    });

    new cdk.CfnOutput(this, 'BrokerSecretArn', {
      value: this.brokerSecret.secretArn,
      description: 'ARN of the secret containing RabbitMQ credentials',
      exportName: `${this.stackName}-BrokerSecretArn`,
    });

    new cdk.CfnOutput(this, 'BrokerConsoleUrl', {
      value: `https://${broker.ref}.mq.${this.region}.amazonaws.com`,
      description: 'RabbitMQ management console URL',
    });

    // Tag all resources
    cdk.Tags.of(this).add('Project', 'BookmarkAI');
    cdk.Tags.of(this).add('Component', 'RabbitMQ');
    cdk.Tags.of(this).add('Environment', environment);
  }

  private getRabbitMQConfiguration(): string {
    return `# RabbitMQ Configuration for BookmarkAI ML Services
# Based on ADR-025 requirements

# Memory Management
vm_memory_high_watermark.relative = 0.6
disk_free_limit.absolute = 5GB

# Networking
# Amazon MQ handles SSL/TLS configuration automatically

# Performance Tuning
# Increase message size limit for ML payloads
max_message_size = 134217728  # 128MB

# Connection settings
heartbeat = 60
consumer_timeout = 1800000  # 30 minutes for long-running ML tasks

# Default user permissions
default_user_tags.administrator = true
default_user_tags.management = true

# Logging (Amazon MQ handles log configuration)
log.console = true
log.console.level = info

# Queue settings - encourage quorum queues
# Note: Quorum queue configuration is done at queue declaration time by clients
queue_master_locator = client-local

# Management plugin is enabled by default in Amazon MQ

# Clustering is handled automatically by Amazon MQ in CLUSTER_MULTI_AZ mode
`;
  }

  private createCloudWatchAlarms(broker: mq.CfnBroker, alarmTopic?: sns.Topic): void {
    const alarmAction = alarmTopic ? [new cloudwatchActions.SnsAction(alarmTopic)] : [];

    // CPU utilization alarm
    new cloudwatch.Alarm(this, 'CpuAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AmazonMQ',
        metricName: 'CpuUtilization',
        dimensionsMap: {
          Broker: broker.ref,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: 'RabbitMQ broker CPU utilization is too high',
    }).addAlarmAction(...alarmAction);

    // Memory usage alarm
    new cloudwatch.Alarm(this, 'MemoryAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AmazonMQ',
        metricName: 'SystemCpuUtilization',
        dimensionsMap: {
          Broker: broker.ref,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: 'RabbitMQ broker memory usage is too high',
    }).addAlarmAction(...alarmAction);

    // Queue depth alarm (for deadletter queue if it exists)
    // Note: Additional queue-specific alarms should be added after queues are created
  }

  /**
   * Grant read access to the RabbitMQ secret
   */
  public grantSecretRead(grantee: iam.IGrantable): iam.Grant {
    return this.brokerSecret.grantRead(grantee);
  }

  /**
   * Add ingress rule to the RabbitMQ security group
   */
  public addIngressRule(peer: ec2.IPeer, port: ec2.Port, description: string): void {
    this.securityGroup.addIngressRule(peer, port, description);
  }
}