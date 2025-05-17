# Testing Instructions for /shares API Endpoint

This document provides step-by-step instructions for testing the newly implemented `/shares` API endpoint with different tools.

## 1. Using the Interactive Test Script

We've created an interactive test script that allows you to easily test all functionality of the `/shares` endpoint through a user-friendly menu:

```bash
# Install dependencies
npm install axios uuid readline

# Run the test script
node test-shares-endpoint.js
```

### Test Script Features

The script provides an interactive menu with the following options:

1. **Authentication Options**:
   - Use an existing token
   - Login with credentials
   - Register a new account

2. **Test Menu**:
   - Create a new share
   - Test idempotency
   - List all shares
   - Get share by ID
   - Run all tests
   - Exit

3. **Colorized Output**:
   - Success messages in green
   - Errors in red
   - Information in cyan
   - Warnings in yellow

4. **Detailed Response Viewing**:
   - All API responses are formatted and displayed
   - Easy validation of response structures

### Using the Script

1. Start the script: `node test-shares-endpoint.js`
2. Choose whether to use an existing token or authenticate
3. If authenticating, enter your credentials when prompted
4. From the menu, select which test you want to run
5. View the detailed results for each operation
6. Continue testing other operations or exit when finished

## 2. Manual Testing with Curl

### Authentication (Get a token)

```bash
# Register or login to get a token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Test123!@#"}'
```

Save the returned token for the next steps:
```bash
export TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6..."
```

### Create a Share

```bash
# Create a share with idempotency key
curl -X POST http://localhost:3001/api/v1/shares \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"url": "https://www.tiktok.com/@user/video/1234567890"}'
```

### Test Idempotency

```bash
# Create a share with a fixed idempotency key
IDEMPOTENCY_KEY="11111111-1111-1111-1111-111111111111"

# First request
curl -X POST http://localhost:3001/api/v1/shares \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{"url": "https://www.tiktok.com/@user/video/1234567890"}'

# Second request (should return the same share)
curl -X POST http://localhost:3001/api/v1/shares \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{"url": "https://www.tiktok.com/@user/video/1234567890"}'
```

### List Shares

```bash
# Get all shares
curl -X GET http://localhost:3001/api/v1/shares \
  -H "Authorization: Bearer $TOKEN"
  
# With pagination
curl -X GET "http://localhost:3001/api/v1/shares?limit=5" \
  -H "Authorization: Bearer $TOKEN"
  
# With filtering
curl -X GET "http://localhost:3001/api/v1/shares?platform=tiktok" \
  -H "Authorization: Bearer $TOKEN"
```

### Get a Specific Share

```bash
# Replace SHARE_ID with an actual ID from the list response
export SHARE_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X GET "http://localhost:3001/api/v1/shares/$SHARE_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## 3. Using Postman/Insomnia

1. **Set up environment variables**:
   - `base_url`: http://localhost:3001/api
   - `token`: (will be populated after login)

2. **Create requests**:

   a. **Login**:
   - Method: POST
   - URL: {{base_url}}/auth/login
   - Body (JSON): 
     ```json
     {
       "email": "test@example.com", 
       "password": "Test123!@#"
     }
     ```
   - Set script to extract and store token from response

   b. **Create Share**:
   - Method: POST
   - URL: {{base_url}}/v1/shares
   - Headers:
     - Authorization: Bearer {{token}}
     - Idempotency-Key: (generate UUID)
   - Body (JSON):
     ```json
     {
       "url": "https://www.tiktok.com/@user/video/1234567890"
     }
     ```

   c. **List Shares**:
   - Method: GET
   - URL: {{base_url}}/v1/shares
   - Headers:
     - Authorization: Bearer {{token}}

   d. **Get Share**:
   - Method: GET
   - URL: {{base_url}}/v1/shares/{{share_id}}
   - Headers:
     - Authorization: Bearer {{token}}

## 4. Expected Responses

### Creating a Share (Success)

```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://www.tiktok.com/@user/video/1234567890",
    "platform": "tiktok",
    "status": "pending",
    "createdAt": "2025-05-17T12:34:56.789Z",
    "updatedAt": "2025-05-17T12:34:56.789Z"
  }
}
```

### List Shares (Success)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "url": "https://www.tiktok.com/@user/video/1234567890",
        "platform": "tiktok",
        "status": "pending",
        "createdAt": "2025-05-17T12:34:56.789Z",
        "updatedAt": "2025-05-17T12:34:56.789Z"
      }
      // More items...
    ],
    "cursor": "2025-05-17T12:34:56.789Z_123e4567-e89b-12d3-a456-426614174000",
    "hasMore": false,
    "limit": 20
  }
}
```

### Get Share by ID (Success)

```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://www.tiktok.com/@user/video/1234567890",
    "platform": "tiktok",
    "status": "pending",
    "createdAt": "2025-05-17T12:34:56.789Z",
    "updatedAt": "2025-05-17T12:34:56.789Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message"
  }
}
```

## 5. Common Issues

1. **Authentication Error**:
   - Ensure your token is valid and not expired
   - Check that the token is properly formatted in the Authorization header

2. **Idempotency Key Missing**:
   - The endpoint requires an idempotency key header for POST requests

3. **Invalid URL**:
   - Only URLs from supported platforms are accepted (TikTok, Reddit, Twitter, X)
   - The URL must use HTTPS protocol

4. **Share Not Found**:
   - Verify the share ID exists and belongs to the authenticated user