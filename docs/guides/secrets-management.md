# Secrets Management Guide

This guide explains how to use the secrets management system in the BookmarkAI project.

## Overview

BookmarkAI uses HashiCorp Vault for secrets management and direnv for environment variable loading. This combination allows for secure management of sensitive information while maintaining ease of use in development.

## Prerequisites

Ensure you have the following tools installed:

1. [direnv](https://direnv.net/) - For automatically loading environment variables
2. [HashiCorp Vault](https://www.vaultproject.io/) - For secrets storage and management
3. [jq](https://stedolan.github.io/jq/) - For JSON processing (used by scripts to parse Vault responses)

## Setup

### 1. Install direnv

Follow the instructions on the [direnv website](https://direnv.net/docs/installation.html) to install direnv for your operating system. Make sure to hook it into your shell.

#### macOS (with Homebrew):

```bash
brew install direnv
```

Then add the following to your shell configuration (`.bashrc`, `.zshrc`, etc.):

```bash
eval "$(direnv hook bash)"  # or zsh, fish, etc.
```

### 2. Install Vault

Follow the instructions on the [Vault website](https://developer.hashicorp.com/vault/tutorials/getting-started/getting-started-install) to install Vault for your operating system.

#### macOS (with Homebrew):

```bash
brew install vault
```

### 3. Install jq

Follow the instructions on the [jq website](https://stedolan.github.io/jq/download/) to install jq for your operating system.

#### macOS (with Homebrew):

```bash
brew install jq
```

## Using the Secrets Management System

### Starting the Vault Dev Server

For local development, use the provided script to start a Vault development server:

```bash
./scripts/setup-vault.sh
```

This script will:

1. Start a Vault dev server on localhost:8200
2. Configure a root token (dev-token-bookmarkai)
3. Enable the KV secrets engine
4. Add some example secrets

### Loading Environment Variables

The project includes a `.envrc` file that integrates with direnv to automatically:

1. Load environment variables from the `.env` file
2. Check if Vault is running and load secrets
3. Set up project-specific utilities

When you enter the project directory, direnv will automatically load these variables.

Allow the `.envrc` file (you only need to do this once):

```bash
direnv allow
```

### Managing Secrets

#### Viewing Secrets in Vault

Use the provided script to list and view secrets:

```bash
# List all available secrets
node scripts/vault-secrets.js --list

# View a specific secret
node scripts/vault-secrets.js secret/bookmarkai/database
```

#### Adding or Updating Secrets

Use the Vault CLI to add or update secrets:

```bash
# Make sure VAULT_ADDR and VAULT_TOKEN are set
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=dev-token-bookmarkai

# Add or update a secret
vault kv put secret/bookmarkai/apikeys \
    OPENAI_API_KEY=your-actual-api-key-here
```

## Secret Categories

The BookmarkAI project uses the following categories for secrets:

1. `secret/bookmarkai/database` - Database credentials
2. `secret/bookmarkai/apikeys` - API keys for external services
3. `secret/bookmarkai/jwt` - JWT and cookie secrets

## Production Considerations

For production environments:

1. Use a properly secured and configured Vault server (not the dev server)
2. Implement proper authentication mechanisms (not the root token)
3. Consider using AWS Secrets Manager or Parameter Store for cloud deployments
4. Rotate secrets regularly
5. Limit access to secrets based on service needs
6. Use proper ACLs in Vault to restrict access

## Troubleshooting

### Vault Server Not Running

If you see the message "Vault server is not running", start the Vault dev server using the provided script:

```bash
./scripts/setup-vault.sh
```

### direnv Permission Issues

If direnv isn't loading your environment variables:

1. Make sure you've allowed the `.envrc` file: `direnv allow`
2. Check if direnv is properly hooked into your shell
3. Try restarting your terminal

### Missing Secrets

If you're missing certain secrets:

1. Check if they exist in Vault: `node scripts/vault-secrets.js --list`
2. Verify your VAULT_TOKEN is set correctly
3. Make sure the `.envrc` file is loading correctly
