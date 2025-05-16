#!/usr/bin/env node

/**
 * Script to retrieve secrets from Vault for the BookmarkAI project
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Config
const vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const vaultToken = process.env.VAULT_TOKEN || '';

// Parse command line arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const listSecrets = args.includes('--list') || args.includes('-l');
const secretPath = args.find(arg => !arg.startsWith('-'));

if (showHelp) {
  console.log(`
BookmarkAI Vault Secrets Utility

Usage:
  node vault-secrets.js [options] [secret-path]

Options:
  --help, -h     Show this help message
  --list, -l     List available secrets in Vault

Examples:
  node vault-secrets.js --list
  node vault-secrets.js secret/bookmarkai/database
  node vault-secrets.js secret/bookmarkai/apikeys
  
Note:
  Set VAULT_ADDR and VAULT_TOKEN environment variables before running.
  `);
  process.exit(0);
}

// Validate Vault token
if (!vaultToken) {
  console.error('Error: VAULT_TOKEN environment variable is not set.');
  console.error('Please set VAULT_TOKEN and try again.');
  process.exit(1);
}

// Make HTTP request to Vault API
function vaultRequest(method, path, headers = {}, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, vaultAddr);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'X-Vault-Token': vaultToken,
        ...headers,
      },
    };

    const req = client.request(options, res => {
      let responseData = '';

      res.on('data', chunk => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          reject(new Error(`Vault API error: ${res.statusCode} ${responseData}`));
        }
      });
    });

    req.on('error', error => {
      reject(new Error(`Request error: ${error.message}`));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// List secrets
async function listAvailableSecrets() {
  try {
    // List root paths
    const rootResponse = await vaultRequest('LIST', '/v1/secret/metadata/');

    if (!rootResponse.data || !rootResponse.data.keys) {
      console.error('Error: Failed to list secret paths.');
      process.exit(1);
    }

    console.log('Available Secret Paths:');

    // Iterate through root paths
    for (const root of rootResponse.data.keys) {
      console.log(`- ${root}`);

      try {
        // List subpaths for each root
        const subResponse = await vaultRequest('LIST', `/v1/secret/metadata/${root}`);

        if (subResponse.data && subResponse.data.keys) {
          for (const subpath of subResponse.data.keys) {
            console.log(`  - ${root}${subpath}`);
          }
        }
      } catch (error) {
        // Skip errors for subpaths that might not exist
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Get specific secret
async function getSecret(path) {
  if (!path) {
    console.error('Error: Secret path is required.');
    console.error('Use --list to see available secrets.');
    process.exit(1);
  }

  // Clean up path
  const cleanPath = path.replace(/^secret\//, '');

  try {
    const response = await vaultRequest('GET', `/v1/secret/data/${cleanPath}`);

    if (!response.data || !response.data.data) {
      console.error(`Error: No data found at path ${path}`);
      process.exit(1);
    }

    console.log(JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error(`Error retrieving secret: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
async function main() {
  if (listSecrets) {
    await listAvailableSecrets();
  } else if (secretPath) {
    await getSecret(secretPath);
  } else {
    console.error('Error: No action specified.');
    console.error('Use --help to see available options.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
