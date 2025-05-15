import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface MlStackProps extends cdk.StackProps {
  envName?: string;
  vpc: ec2.Vpc;
}

export class MlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MlStackProps) {
    super(scope, id, props);

    const environment = props.envName || 'dev';

    // Create ECS cluster
    const cluster = new ecs.Cluster(this, 'BookmarkAIMLCluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    // Create ECR repository for ML services
    const mlRepository = new ecr.Repository(this, 'MLRepository', {
      repositoryName: `bookmarkai/ml-${environment}`,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
    });

    // Create S3 bucket for media storage
    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `bookmarkai-media-${environment}-${this.account}`,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: environment === 'dev',
      lifecycleRules: [
        {
          id: 'TemporaryMediaRule',
          expiration: cdk.Duration.days(7),
          prefix: 'temp/',
        },
      ],
    });

    // Task execution role
    const executionRole = new iam.Role(this, 'MLTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Task role with required permissions
    const taskRole = new iam.Role(this, 'MLTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add required policies for task role
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:GetParameters',
          'secretsmanager:GetSecretValue',
          'kms:Decrypt',
        ],
        resources: ['*'],
      })
    );

    // Grant S3 access to the ML service
    mediaBucket.grantReadWrite(taskRole);

    // Create log group
    const logGroup = new logs.LogGroup(this, 'MLServiceLogs', {
      logGroupName: `/bookmarkai/${environment}/ml`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
    });

    // Create task definition for caption service
    const captionTaskDefinition = new ecs.FargateTaskDefinition(this, 'CaptionTaskDefinition', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      executionRole,
      taskRole,
    });

    // Add container to task definition
    const captionContainer = captionTaskDefinition.addContainer('CaptionContainer', {
      image: ecs.ContainerImage.fromEcrRepository(mlRepository, 'caption-latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'caption',
        logGroup,
      }),
      environment: {
        ENVIRONMENT: environment,
        MEDIA_BUCKET: mediaBucket.bucketName,
      },
    });

    // Create security group for ML services
    const mlSecurityGroup = new ec2.SecurityGroup(this, 'MLSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for BookmarkAI ML services',
      allowAllOutbound: true,
    });

    // Create ECS service for caption service
    const captionService = new ecs.FargateService(this, 'CaptionService', {
      cluster,
      taskDefinition: captionTaskDefinition,
      desiredCount: environment === 'dev' ? 1 : 2,
      securityGroups: [mlSecurityGroup],
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Output the S3 bucket name
    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: mediaBucket.bucketName,
      description: 'Media S3 bucket name',
    });
  }
}