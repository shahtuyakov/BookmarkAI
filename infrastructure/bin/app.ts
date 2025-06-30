#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { ApiStack } from '../lib/api-stack';
import { WorkerStack } from '../lib/worker-stack';
import { MlStack } from '../lib/ml-stack';
import { RabbitMQStack } from '../lib/rabbitmq-stack';

const app = new cdk.App();

// Create database stack
const databaseStack = new DatabaseStack(app, 'BookmarkAI-Database-Dev', {
  envName: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Create RabbitMQ stack
const rabbitMQStack = new RabbitMQStack(app, 'BookmarkAI-RabbitMQ-Dev', {
  envName: 'dev',
  vpc: databaseStack.vpc,
  alertEmail: process.env.ALERT_EMAIL, // Optional: Set ALERT_EMAIL env var for CloudWatch alerts
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Create API stack
const apiStack = new ApiStack(app, 'BookmarkAI-API-Dev', {
  envName: 'dev',
  vpc: databaseStack.vpc,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Create Worker stack
const workerStack = new WorkerStack(app, 'BookmarkAI-Worker-Dev', {
  envName: 'dev',
  vpc: databaseStack.vpc,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Create ML stack
const mlStack = new MlStack(app, 'BookmarkAI-ML-Dev', {
  envName: 'dev',
  vpc: databaseStack.vpc,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Add dependencies to ensure proper creation order
rabbitMQStack.addDependency(databaseStack);
apiStack.addDependency(databaseStack);
workerStack.addDependency(databaseStack);
mlStack.addDependency(databaseStack);

// ML services depend on RabbitMQ
mlStack.addDependency(rabbitMQStack);

app.synth();