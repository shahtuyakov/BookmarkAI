import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

interface ApiStackProps extends cdk.StackProps {
  envName?: string;
  vpc: ec2.Vpc;
  // We no longer directly reference the security groups
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const environment = props.envName || 'dev';

    // Create ECS cluster
    const cluster = new ecs.Cluster(this, 'BookmarkAICluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    // Create ECR repository for API
    const apiRepository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: `bookmarkai/api-${environment}`,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
    });

    // Task execution role
    const executionRole = new iam.Role(this, 'ApiTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Task role with required permissions
    const taskRole = new iam.Role(this, 'ApiTaskRole', {
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

    // Create log group
    const logGroup = new logs.LogGroup(this, 'ApiServiceLogs', {
      logGroupName: `/bookmarkai/${environment}/api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: environment === 'dev' 
        ? cdk.RemovalPolicy.DESTROY 
        : cdk.RemovalPolicy.RETAIN,
    });

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole,
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logGroup,
      }),
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    container.addPortMappings({
      containerPort: 3000,
      hostPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // Create security group for API service
    const apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for BookmarkAI API service',
      allowAllOutbound: true,
    });

    // Allow API security group to receive inbound HTTP traffic from load balancer
    apiSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'Allow HTTP traffic to API'
    );

    // Create load balancer
    const lb = new elbv2.ApplicationLoadBalancer(this, 'ApiLoadBalancer', {
      vpc: props.vpc,
      internetFacing: true,
    });

    // Create target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        port: '3000',
        healthyHttpCodes: '200',
      },
    });

    // Add listener to load balancer
    const listener = lb.addListener('ApiListener', {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Create ECS service
    const service = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition,
      desiredCount: environment === 'dev' ? 1 : 2,
      securityGroups: [apiSecurityGroup],
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Add service to target group
    service.attachToApplicationTargetGroup(targetGroup);

    // Output the load balancer DNS
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: lb.loadBalancerDnsName,
      description: 'API endpoint',
    });
  }
}