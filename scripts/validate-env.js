#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * Ensures consistency across all environment files
 */

const fs = require('fs');
const path = require('path');

const ENV_DIR = path.join(__dirname, '..', 'env');
const ENVIRONMENTS = ['development', 'staging', 'production'];

// Define required variables for each service
const REQUIRED_VARS = {
  base: [
    'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
    'CACHE_HOST', 'CACHE_PORT',
    'MQ_HOST', 'MQ_PORT', 'MQ_USER', 'MQ_PASSWORD',
    'STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY',
    'AUTH_JWT_SECRET', 'ML_OPENAI_API_KEY'
  ],
  'api-gateway': [
    'API_PORT', 'SERVICE_NAME', 'DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL'
  ],
  'python-services': [
    'CELERY_BROKER_URL', 'CELERY_RESULT_BACKEND', 'DATABASE_URL'
  ],
  'mobile': [
    'REACT_APP_API_URL', 'REACT_APP_BUNDLE_ID'
  ],
  'extension': [
    'EXTENSION_API_URL', 'EXTENSION_NAME'
  ]
};

// Parse .env file
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  
  content.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) return;
    
    const [key, ...valueParts] = line.split('=');
    if (key) {
      vars[key.trim()] = valueParts.join('=').trim();
    }
  });
  
  return vars;
}

// Validate environment consistency
function validateEnvironment(env) {
  console.log(`\\n📋 Validating ${env} environment...`);
  
  const errors = [];
  const warnings = [];
  
  // Load base vars
  const baseVars = parseEnvFile(path.join(ENV_DIR, 'base.env'));
  const sharedVars = parseEnvFile(path.join(ENV_DIR, env, 'shared.env'));
  
  // Check required base variables
  REQUIRED_VARS.base.forEach(varName => {
    if (!baseVars[varName] && !sharedVars[varName]) {
      errors.push(`Missing required variable: ${varName}`);
    }
  });
  
  // Check each service
  const serviceFiles = fs.readdirSync(path.join(ENV_DIR, env))
    .filter(f => f.endsWith('.env') && f !== 'shared.env');
  
  serviceFiles.forEach(file => {
    const serviceName = file.replace('.env', '');
    const serviceVars = parseEnvFile(path.join(ENV_DIR, env, file));
    const allVars = { ...baseVars, ...sharedVars, ...serviceVars };
    
    // Check required service variables
    if (REQUIRED_VARS[serviceName]) {
      REQUIRED_VARS[serviceName].forEach(varName => {
        if (!allVars[varName]) {
          errors.push(`${serviceName}: Missing required variable: ${varName}`);
        }
      });
    }
    
    // Check for variable references
    Object.entries(serviceVars).forEach(([key, value]) => {
      const refs = value.match(/\\${([^}]+)}/g);
      if (refs) {
        refs.forEach(ref => {
          const refVar = ref.slice(2, -1).split(':')[0];
          if (!allVars[refVar]) {
            warnings.push(`${serviceName}: Variable ${key} references undefined ${refVar}`);
          }
        });
      }
    });
  });
  
  // Report results
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`✅ ${env} environment is valid`);
  } else {
    if (errors.length > 0) {
      console.log(`\\n❌ Errors in ${env}:`);
      errors.forEach(e => console.log(`   - ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`\\n⚠️  Warnings in ${env}:`);
      warnings.forEach(w => console.log(`   - ${w}`));
    }
  }
  
  return errors.length === 0;
}

// Check for duplicate variables across services
function checkDuplicates() {
  console.log('\\n🔍 Checking for duplicate variables across services...');
  
  const varLocations = {};
  
  ENVIRONMENTS.forEach(env => {
    const serviceFiles = fs.readdirSync(path.join(ENV_DIR, env))
      .filter(f => f.endsWith('.env') && f !== 'shared.env');
    
    serviceFiles.forEach(file => {
      const serviceName = file.replace('.env', '');
      const serviceVars = parseEnvFile(path.join(ENV_DIR, env, file));
      
      Object.keys(serviceVars).forEach(varName => {
        if (!varLocations[varName]) {
          varLocations[varName] = [];
        }
        varLocations[varName].push(`${env}/${serviceName}`);
      });
    });
  });
  
  // Find duplicates
  const duplicates = Object.entries(varLocations)
    .filter(([_, locations]) => locations.length > 1)
    .filter(([varName]) => !varName.startsWith('SERVICE_')); // Ignore service-specific vars
  
  if (duplicates.length > 0) {
    console.log('\\n⚠️  Variables defined in multiple service files:');
    duplicates.forEach(([varName, locations]) => {
      console.log(`   - ${varName}: ${locations.join(', ')}`);
      console.log('     Consider moving to shared.env or base.env');
    });
  } else {
    console.log('✅ No problematic duplicates found');
  }
}

// Main validation
console.log('🔧 BookmarkAI Environment Validation Tool\\n');

let allValid = true;

// Validate base.env exists
if (!fs.existsSync(path.join(ENV_DIR, 'base.env'))) {
  console.error('❌ Missing base.env file!');
  allValid = false;
} else {
  // Validate each environment
  ENVIRONMENTS.forEach(env => {
    if (!fs.existsSync(path.join(ENV_DIR, env))) {
      console.error(`❌ Missing ${env} directory!`);
      allValid = false;
    } else {
      const valid = validateEnvironment(env);
      allValid = allValid && valid;
    }
  });
}

// Check for duplicates
checkDuplicates();

// Summary
console.log('\\n' + '='.repeat(50));
if (allValid) {
  console.log('✅ All environment configurations are valid!');
  process.exit(0);
} else {
  console.log('❌ Environment validation failed!');
  process.exit(1);
}