#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { ApiStack } from '../lib/api-stack';
import { WorkerStack } from '../lib/worker-stack';
import { MlStack } from '../lib/ml-stack';

const app = new cdk.App();

// Create database stack
const databaseStack = new DatabaseStack(app, 'BookmarkAI-Database-Dev', {
  envName: 'dev',
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

// Add dependencies to ensure the database stack is created first
apiStack.addDependency(databaseStack);
workerStack.addDependency(databaseStack);
mlStack.addDependency(databaseStack);

app.synth();