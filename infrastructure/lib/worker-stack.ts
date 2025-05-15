import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

interface WorkerStackProps extends cdk.StackProps {
  envName?: string;
  vpc: ec2.Vpc;
}

export class WorkerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WorkerStackProps) {
    super(scope, id, props);

    const environment = props.envName || 'dev';

    // Create ECS cluster (could reuse the API cluster in a real scenario)
    const cluster = new ecs.Cluster(this, 'BookmarkAIWorkerCluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    // Create ECR repository for worker
    const workerRepository = new ecr.Repository(this, 'WorkerRepository', {
      repositoryName: `bookmarkai/worker-${environment}`,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
    });

    // Task execution role
    const executionRole = new iam.Role(this, 'WorkerTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Task role with required permissions
    const taskRole = new iam.Role(this, 'WorkerTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add required policies for task role
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:GetParameters',
          'secretsmanager:GetSecretValue',
          'kms:Decrypt',
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
        ],
        resources: ['*'],
      })
    );

    // Create log group
    const logGroup = new logs.LogGroup(this, 'WorkerServiceLogs', {
      logGroupName: `/bookmarkai/${environment}/worker`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
    });

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole,
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromEcrRepository(workerRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
        logGroup,
      }),
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
      },
    });

    // Create security group for worker service
    const workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for BookmarkAI worker service',
      allowAllOutbound: true,
    });

    // Create ECS service
    const service = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition,
      desiredCount: environment === 'dev' ? 1 : 2,
      securityGroups: [workerSecurityGroup],
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });
  }
}