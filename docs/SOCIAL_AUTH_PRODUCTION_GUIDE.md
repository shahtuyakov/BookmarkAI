# Social Authentication Production Setup Guide

This guide covers the complete setup process for deploying social authentication (Google and Apple Sign-In) to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [OAuth Provider Setup](#oauth-provider-setup)
4. [Database Migration](#database-migration)
5. [Security Checklist](#security-checklist)
6. [Deployment Steps](#deployment-steps)
7. [Monitoring and Metrics](#monitoring-and-metrics)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 14+ with pgvector extension
- [ ] Redis 6+ for rate limiting
- [ ] Valid SSL certificate for HTTPS
- [ ] Google Cloud Console access
- [ ] Apple Developer Account ($99/year for production)

## Environment Configuration

### Required Environment Variables

Add these to your production `.env` file:

```bash
# Social Authentication
SOCIAL_AUTH_ENABLED=true                    # Enable/disable social auth globally

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id      # From Google Cloud Console

# Apple Sign-In
APPLE_CLIENT_ID=your_apple_client_id        # Your app's bundle ID
APPLE_TEAM_ID=your_apple_team_id           # From Apple Developer Portal
APPLE_KEY_ID=your_apple_key_id             # Key ID from Apple
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
your_apple_private_key_content
-----END PRIVATE KEY-----"                  # Private key content

# Security
NODE_ENV=production                         # Enforces HTTPS for social auth
```

## OAuth Provider Setup

### Google OAuth Setup

1. **Create OAuth 2.0 Credentials**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to APIs & Services > Credentials
   - Create OAuth 2.0 Client ID
   - Application Type: Web application
   - Add authorized JavaScript origins:
     ```
     https://yourdomain.com
     https://api.yourdomain.com
     ```
   - Add authorized redirect URIs:
     ```
     https://api.yourdomain.com/v1/auth/social/google/callback
     ```

2. **Configure OAuth Consent Screen**
   - User Type: External
   - Add required scopes: `email`, `profile`, `openid`
   - Add your app information and privacy policy

3. **Mobile App Configuration**
   - For iOS: Add bundle ID to OAuth client
   - For Android: Add SHA-1 certificate fingerprint

### Apple Sign-In Setup

1. **Enable Sign in with Apple**
   - Log in to [Apple Developer Portal](https://developer.apple.com)
   - Navigate to Certificates, Identifiers & Profiles
   - Select your app identifier
   - Enable "Sign in with Apple" capability

2. **Create Service ID**
   - Register a new Service ID for web authentication
   - Configure domains and return URLs:
     ```
     Domain: yourdomain.com
     Return URL: https://api.yourdomain.com/v1/auth/social/apple/callback
     ```

3. **Generate Private Key**
   - Create a new key in Certificates, Identifiers & Profiles
   - Enable "Sign in with Apple"
   - Download the `.p8` file
   - Extract the private key content for `APPLE_PRIVATE_KEY`

4. **Configure Mobile Apps**
   - iOS: Add Sign in with Apple capability in Xcode
   - Android: Follow [Apple's Android integration guide](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js)

## Database Migration

### Automated Deployment

Use the provided deployment script:

```bash
./scripts/deploy-with-migrations.sh
```

### Manual Migration

1. **Check existing schema**:
   ```sql
   -- Connect to your database
   psql -U bookmarkai -d bookmarkai_production

   -- Verify users table columns
   \d users

   -- Check for social_auth_profiles table
   \dt social_auth_profiles
   ```

2. **Run migrations**:
   ```bash
   cd packages/api-gateway
   npm run db:migrate
   ```

3. **Verify migration**:
   ```sql
   -- Check provider columns
   SELECT column_name FROM information_schema.columns 
   WHERE table_name='users' AND column_name IN ('provider', 'provider_id', 'avatar_url');

   -- Check social_auth_profiles table
   SELECT * FROM social_auth_profiles LIMIT 1;
   ```

## Security Checklist

### HTTPS Enforcement
- [x] `HttpsOnlyGuard` applied to social auth endpoints
- [x] SSL certificate installed and valid
- [x] Force redirect HTTP to HTTPS at load balancer level

### Token Security
- [x] Refresh tokens hashed with SHA-256 before storage
- [x] ID tokens validated with provider libraries
- [x] Nonce validation for replay attack prevention

### Rate Limiting
- [x] IP-based: 10 requests per minute per endpoint
- [x] Provider-based: 10 attempts per 5 minutes per provider
- [x] Email-based: 3 attempts per 10 minutes

### Additional Security
- [ ] Configure CORS to allow only your domains
- [ ] Set up Web Application Firewall (WAF)
- [ ] Enable audit logging for auth events
- [ ] Regular security scans with OWASP ZAP

## Deployment Steps

### 1. Pre-deployment Checklist
```bash
# Verify environment variables
cat .env | grep -E "(SOCIAL_AUTH|GOOGLE|APPLE)"

# Test OAuth credentials
curl -X POST https://oauth2.googleapis.com/tokeninfo \
  -d "id_token=YOUR_TEST_TOKEN"

# Check database connectivity
pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER
```

### 2. Deploy with Zero Downtime

```bash
# Step 1: Deploy with social auth disabled
SOCIAL_AUTH_ENABLED=false npm run deploy

# Step 2: Run migrations
npm run db:migrate

# Step 3: Enable social auth
SOCIAL_AUTH_ENABLED=true npm run deploy

# Step 4: Verify deployment
curl https://api.yourdomain.com/health
```

### 3. Gradual Rollout

```javascript
// Use feature flags for percentage-based rollout
if (Math.random() < 0.05) { // 5% of users
  showSocialAuthButtons = true;
}
```

## Monitoring and Metrics

### Prometheus Metrics Endpoint
```
https://api.yourdomain.com/auth/metrics/prometheus
```

### Key Metrics to Monitor

1. **Success Rate**
   ```
   rate(auth_success_total{provider="google"}[5m])
   ```

2. **Error Rate**
   ```
   rate(auth_failure_total{provider="google"}[5m])
   ```

3. **Response Time**
   ```
   histogram_quantile(0.95, auth_latency_seconds_bucket{provider="google"})
   ```

4. **New User Registrations**
   ```
   sum(rate(auth_new_user_registration_total[1h])) by (provider)
   ```

### Grafana Dashboard

Import the provided dashboard JSON:
```json
{
  "dashboard": {
    "title": "Social Authentication Metrics",
    "panels": [
      {
        "title": "Auth Success Rate by Provider",
        "targets": [{
          "expr": "rate(auth_success_total[5m])"
        }]
      },
      {
        "title": "Auth Latency P95",
        "targets": [{
          "expr": "histogram_quantile(0.95, auth_latency_seconds_bucket)"
        }]
      }
    ]
  }
}
```

### Alerts

```yaml
# prometheus-alerts.yml
groups:
  - name: social_auth
    rules:
      - alert: HighAuthFailureRate
        expr: rate(auth_failure_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High authentication failure rate"
          
      - alert: SlowAuthResponse
        expr: histogram_quantile(0.95, auth_latency_seconds_bucket) > 2
        for: 5m
        annotations:
          summary: "Authentication latency exceeds 2s (p95)"
```

## Troubleshooting

### Common Issues

#### 1. "Invalid Google ID token"
- **Cause**: Token expired or wrong client ID
- **Solution**: 
  - Verify `GOOGLE_CLIENT_ID` matches OAuth credentials
  - Check token expiration
  - Ensure clock sync between servers

#### 2. "Apple authentication failed"
- **Cause**: Invalid private key or configuration
- **Solution**:
  - Verify private key format (must include headers)
  - Check `APPLE_TEAM_ID` and `APPLE_KEY_ID`
  - Ensure Service ID matches `APPLE_CLIENT_ID`

#### 3. "HTTPS required for this endpoint"
- **Cause**: Request made over HTTP in production
- **Solution**:
  - Configure SSL certificate
  - Set up HTTPS redirect
  - Check proxy headers (X-Forwarded-Proto)

#### 4. Rate limit exceeded
- **Cause**: Too many authentication attempts
- **Solution**:
  - Check Redis connectivity
  - Review rate limit thresholds
  - Implement exponential backoff in client

### Debug Commands

```bash
# Check Redis rate limit keys
redis-cli KEYS "ratelimit:*"

# View auth logs
docker logs api-gateway | grep -E "(auth|social)"

# Test provider connectivity
curl -I https://appleid.apple.com
curl -I https://oauth2.googleapis.com

# Database connection test
psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c "SELECT NOW();"
```

### Support Contacts

- **Google OAuth Issues**: https://console.cloud.google.com/support
- **Apple Sign-In Issues**: https://developer.apple.com/contact
- **Internal Support**: devops@bookmarkai.com

## Performance Optimization

### Target Metrics
- Authentication latency: < 2s (p95)
- Token validation: < 500ms
- Database queries: < 100ms

### Optimization Tips

1. **Connection Pooling**
   ```javascript
   // PostgreSQL connection pool
   {
     max: 20,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   }
   ```

2. **Redis Optimization**
   ```bash
   # Enable Redis persistence
   redis-cli CONFIG SET save "900 1 300 10 60 10000"
   ```

3. **Database Indexes**
   ```sql
   -- Verify indexes are being used
   EXPLAIN ANALYZE 
   SELECT * FROM users 
   WHERE provider = 'google' AND provider_id = '123';
   ```

## Rollback Plan

If issues occur after deployment:

1. **Disable social auth immediately**:
   ```bash
   SOCIAL_AUTH_ENABLED=false npm run deploy
   ```

2. **Monitor error rates**:
   ```bash
   tail -f /var/log/api-gateway/error.log
   ```

3. **Revert code if needed**:
   ```bash
   git revert HEAD
   npm run deploy
   ```

4. **Communicate with users**:
   - Update status page
   - Send notification about temporary unavailability

---

## Appendix: Environment Variable Template

```bash
# .env.production
NODE_ENV=production
SOCIAL_AUTH_ENABLED=true

# Google OAuth
GOOGLE_CLIENT_ID=369367919034-example.apps.googleusercontent.com

# Apple Sign-In
APPLE_CLIENT_ID=com.bookmarkai.app
APPLE_TEAM_ID=ABCDEF1234
APPLE_KEY_ID=ZYXWVU9876
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"

# Database
DATABASE_URL=postgresql://user:pass@host:5432/bookmarkai_prod

# Redis
REDIS_URL=redis://:password@redis-host:6379

# Monitoring
PROMETHEUS_PUSHGATEWAY_URL=http://prometheus:9091
```

Remember to never commit actual credentials to version control!