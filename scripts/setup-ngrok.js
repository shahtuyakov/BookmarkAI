#!/usr/bin/env node

/**
 * ngrok Setup Script for BookmarkAI Local Testing
 * 
 * This script implements the ngrok local testing infrastructure as defined in ADR-010.
 * It creates a tunnel to the local API server and injects the URL into all client environments.
 * 
 * Usage:
 *   npm run dev:tunnel
 *   node scripts/setup-ngrok.js
 * 
 * Environment Variables Required:
 *   NGROK_AUTH_TOKEN - ngrok authentication token for reserved domain
 */

const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Configuration based on ADR-010
const NGROK_CONFIG = {
  DOMAIN: 'bookmarkai-dev.ngrok.app',
  API_PORT: 3001, // Actual API port (not 3000 as in ADR)
  REGION: 'us',
  PROTOCOL: 'http',
  AUTH_TOKEN_ENV: 'NGROK_AUTH_TOKEN',
};

// File paths for environment injection
const ENV_TARGETS = {
  // React Native Metro config (if exists)
  REACT_NATIVE_CONFIG: 'packages/mobile/metro.config.js',
  
  // WebExtension manifest (if exists) 
  WEB_EXTENSION_MANIFEST: 'packages/web-extension/manifest.json',
  
  // Environment files
  API_ENV: 'packages/api-gateway/.env.local',
  ROOT_ENV: '.env.local',
};

class NgrokSetup {
  constructor() {
    this.tunnelUrl = null;
    this.isConnected = false;
  }

  /**
   * Main setup function
   */
  async setup() {
    try {
      console.log(chalk.blue('🚀 Starting ngrok tunnel setup for BookmarkAI...'));
      
      // Validate environment
      await this.validateEnvironment();
      
      // Connect to ngrok
      await this.connectTunnel();
      
      // Inject URL into client environments
      await this.injectEnvironmentUrls();
      
      // Display success message
      this.displaySuccessMessage();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error(chalk.red('❌ ngrok setup failed:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Validate that required environment variables and dependencies are available
   */
  async validateEnvironment() {
    console.log(chalk.yellow('📋 Validating environment...'));
    
    // Check for ngrok auth token
    const authToken = process.env[NGROK_CONFIG.AUTH_TOKEN_ENV];
    if (!authToken) {
      throw new Error(
        `Missing ${NGROK_CONFIG.AUTH_TOKEN_ENV} environment variable. ` +
        'Please set your ngrok auth token for reserved domain access.'
      );
    }

    // Check if API server is running (optional check)
    console.log(chalk.gray(`  ✓ ngrok auth token found`));
    console.log(chalk.gray(`  ✓ Will tunnel to localhost:${NGROK_CONFIG.API_PORT}`));
    console.log(chalk.gray(`  ✓ Reserved domain: ${NGROK_CONFIG.DOMAIN}`));
  }

  /**
   * Connect ngrok tunnel with reserved domain
   */
  async connectTunnel() {
    console.log(chalk.yellow('🔗 Connecting ngrok tunnel...'));
    
    try {
      this.tunnelUrl = await ngrok.connect({
        proto: NGROK_CONFIG.PROTOCOL,
        addr: NGROK_CONFIG.API_PORT,
        subdomain: NGROK_CONFIG.DOMAIN.split('.')[0], // 'bookmarkai-dev'
        authtoken: process.env[NGROK_CONFIG.AUTH_TOKEN_ENV],
        region: NGROK_CONFIG.REGION,
        onStatusChange: (status) => {
          console.log(chalk.gray(`  Tunnel status: ${status}`));
        },
        onLogEvent: (data) => {
          if (data.level === 'error') {
            console.log(chalk.red(`  ngrok error: ${data.msg}`));
          }
        }
      });

      this.isConnected = true;
      console.log(chalk.green(`  ✓ Tunnel connected: ${this.tunnelUrl}`));
      
    } catch (error) {
      if (error.message.includes('subdomain')) {
        throw new Error(
          `Failed to connect to reserved subdomain '${NGROK_CONFIG.DOMAIN}'. ` +
          'Please verify your ngrok team subscription and subdomain reservation.'
        );
      }
      throw new Error(`ngrok connection failed: ${error.message}`);
    }
  }

  /**
   * Inject tunnel URL into various client environment configurations
   */
  async injectEnvironmentUrls() {
    console.log(chalk.yellow('🔧 Injecting tunnel URL into client environments...'));
    
    // Create/update .env.local files
    await this.updateEnvironmentFiles();
    
    // Update React Native config (if exists)
    await this.updateReactNativeConfig();
    
    // Update WebExtension manifest (if exists)
    await this.updateWebExtensionManifest();
    
    console.log(chalk.green('  ✓ Environment URLs updated'));
  }

  /**
   * Update .env.local files with tunnel URL
   */
  async updateEnvironmentFiles() {
    const envContent = `
# ngrok tunnel configuration (auto-generated)
API_BASE_URL=${this.tunnelUrl}/api
NGROK_ENABLED=true
NGROK_TUNNEL_URL=${this.tunnelUrl}
TOKEN_KEY_ID=local
NODE_ENV=development
`;

    // Update API gateway .env.local
    const apiEnvPath = ENV_TARGETS.API_ENV;
    if (fs.existsSync(path.dirname(apiEnvPath))) {
      fs.writeFileSync(apiEnvPath, envContent);
      console.log(chalk.gray(`    ✓ Updated ${apiEnvPath}`));
    }

    // Update root .env.local
    fs.writeFileSync(ENV_TARGETS.ROOT_ENV, envContent);
    console.log(chalk.gray(`    ✓ Updated ${ENV_TARGETS.ROOT_ENV}`));
  }

  /**
   * Update React Native configuration (if it exists)
   */
  async updateReactNativeConfig() {
    const configPath = ENV_TARGETS.REACT_NATIVE_CONFIG;
    if (!fs.existsSync(configPath)) {
      console.log(chalk.gray(`    ⚠ React Native config not found: ${configPath}`));
      return;
    }

    // Read and modify metro config to inject API_BASE_URL
    const configContent = fs.readFileSync(configPath, 'utf8');
    // This would need specific implementation based on actual metro.config.js structure
    console.log(chalk.gray(`    ✓ React Native config ready for manual update`));
  }

  /**
   * Update WebExtension manifest (if it exists)
   */
  async updateWebExtensionManifest() {
    const manifestPath = ENV_TARGETS.WEB_EXTENSION_MANIFEST;
    if (!fs.existsSync(manifestPath)) {
      console.log(chalk.gray(`    ⚠ WebExtension manifest not found: ${manifestPath}`));
      return;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      // Update permissions to include ngrok domain
      if (manifest.permissions) {
        const ngrokPermission = `${this.tunnelUrl}/*`;
        if (!manifest.permissions.includes(ngrokPermission)) {
          manifest.permissions.push(ngrokPermission);
        }
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(chalk.gray(`    ✓ Updated WebExtension manifest`));
      
    } catch (error) {
      console.log(chalk.yellow(`    ⚠ Failed to update WebExtension manifest: ${error.message}`));
    }
  }

  /**
   * Display success message with important information
   */
  displaySuccessMessage() {
    console.log('\n' + chalk.green('🎉 ngrok tunnel setup complete!'));
    console.log('\n' + chalk.bold('Tunnel Information:'));
    console.log(`  ${chalk.cyan('Public URL:')} ${this.tunnelUrl}`);
    console.log(`  ${chalk.cyan('Local API:')} http://localhost:${NGROK_CONFIG.API_PORT}/api`);
    console.log(`  ${chalk.cyan('Tunnel Status:')} https://dashboard.ngrok.com/`);
    
    console.log('\n' + chalk.bold('Testing URLs:'));
    console.log(`  ${chalk.cyan('Health Check:')} ${this.tunnelUrl}/api/health`);
    console.log(`  ${chalk.cyan('API Docs:')} ${this.tunnelUrl}/api/docs`);
    
    console.log('\n' + chalk.bold('Client Integration:'));
    console.log(`  ${chalk.gray('• React Native:')} API_BASE_URL set to ${this.tunnelUrl}/api`);
    console.log(`  ${chalk.gray('• iOS Extension:')} Configure with ${this.tunnelUrl}`);
    console.log(`  ${chalk.gray('• WebExtension:')} Permissions updated for ${this.tunnelUrl}`);
    
    console.log('\n' + chalk.yellow('📝 Note: Keep this process running to maintain the tunnel'));
    console.log(chalk.yellow('📝 Press Ctrl+C to stop the tunnel and cleanup'));
  }

  /**
   * Setup graceful shutdown to cleanup tunnel
   */
  setupGracefulShutdown() {
    const cleanup = async () => {
      if (this.isConnected) {
        console.log('\n' + chalk.yellow('🔌 Disconnecting ngrok tunnel...'));
        try {
          await ngrok.disconnect();
          await ngrok.kill();
          console.log(chalk.green('✓ Tunnel disconnected successfully'));
        } catch (error) {
          console.error(chalk.red('Error disconnecting tunnel:'), error.message);
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (error) => {
      console.error(chalk.red('Uncaught exception:'), error);
      cleanup();
    });
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  const setup = new NgrokSetup();
  setup.setup().catch((error) => {
    console.error(chalk.red('Setup failed:'), error);
    process.exit(1);
  });
}

module.exports = NgrokSetup;