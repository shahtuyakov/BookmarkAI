import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';

interface DatabaseStackProps extends cdk.StackProps {
  envName?: string;
  envContext?: any;
}

export class DatabaseStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;
  public readonly postgresInstance: rds.DatabaseInstance;
  public readonly redisCluster: elasticache.CfnCacheCluster;

  constructor(scope: Construct, id: string, props: DatabaseStackProps = {}) {
    super(scope, id, props);

    const environment = props.envName || 'dev';

    // Create VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'BookmarkAIVpc', {
      maxAzs: 2,
      natGateways: environment === 'dev' ? 1 : 2,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Create security groups
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for BookmarkAI PostgreSQL database',
      allowAllOutbound: true,
    });

    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for BookmarkAI Redis cluster',
      allowAllOutbound: true,
    });

    // Pre-configure security group rules to allow 5432 and 6379 from within the VPC
    // This avoids circular dependencies
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL connections from within VPC'
    );
    
    this.redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis connections from within VPC'
    );

    // For development environment, create basic RDS instance
    if (environment === 'dev') {
      // PostgreSQL with pgvector for development
      this.postgresInstance = new rds.DatabaseInstance(this, 'BookmarkAIPostgres', {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_15,
        }),
        vpc: this.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.MEDIUM
        ),
        allocatedStorage: 20,
        securityGroups: [this.dbSecurityGroup],
        databaseName: 'bookmarkai',
        credentials: rds.Credentials.fromGeneratedSecret('dbadmin'),
        parameterGroup: new rds.ParameterGroup(this, 'BookmarkAIPostgresParams', {
          engine: rds.DatabaseInstanceEngine.postgres({
            version: rds.PostgresEngineVersion.VER_15,
          }),
          parameters: {
            'shared_preload_libraries': 'pg_vector',
          },
        }),
      });

      // Redis for development
      const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
        description: 'Subnet group for BookmarkAI Redis',
        subnetIds: this.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }).subnetIds,
      });

      this.redisCluster = new elasticache.CfnCacheCluster(this, 'BookmarkAIRedis', {
        cacheNodeType: 'cache.t3.small',
        engine: 'redis',
        numCacheNodes: 1,
        cacheSubnetGroupName: subnetGroup.ref,
        vpcSecurityGroupIds: [this.redisSecurityGroup.securityGroupId],
      });
    }

    // Output the database endpoint and Redis endpoint
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.postgresInstance?.dbInstanceEndpointAddress || 'No database instance created',
      description: 'PostgreSQL endpoint',
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisCluster?.attrRedisEndpointAddress || 'No Redis cluster created',
      description: 'Redis endpoint',
    });
  }
}