# Authentication API Reference

This document details the authentication endpoints for the BookmarkAI API.

## Base URL

All endpoints are relative to: `http://localhost:3001/api/` for local development.

## Authentication

Most endpoints require authentication via a JWT token. Include the token in the `Authorization` header:

```
Authorization: Bearer <your_access_token>
```

## Endpoints

### User Registration

Registers a new user and sends a verification email.

**Endpoint:** `POST /auth/register`

**Authentication Required:** No

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "User Name",
  "password": "Password123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1...",
  "refreshToken": "eyJhbGciOiJSUzI1...",
  "expiresIn": 900,
  "user": {
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

**Status Codes:**
- `201 Created`: Registration successful
- `409 Conflict`: Email already in use
- `400 Bad Request`: Invalid input data

### User Login

Authenticates a user and returns tokens.

**Endpoint:** `POST /auth/login`

**Authentication Required:** No

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1...",
  "refreshToken": "eyJhbGciOiJSUzI1...",
  "expiresIn": 900
}
```

**Status Codes:**
- `200 OK`: Login successful
- `401 Unauthorized`: Invalid credentials
- `400 Bad Request`: Invalid input data

### Token Refresh

Refreshes an expired access token using a refresh token.

**Endpoint:** `POST /auth/refresh`

**Authentication Required:** No

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1...",
  "refreshToken": "eyJhbGciOiJSUzI1...",
  "expiresIn": 900
}
```

**Status Codes:**
- `200 OK`: Token refresh successful
- `401 Unauthorized`: Invalid refresh token
- `400 Bad Request`: Invalid input data

### User Logout

Logs out a user by invalidating their refresh token.

**Endpoint:** `POST /auth/logout`

**Authentication Required:** Yes

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1..."
}
```

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200 OK`: Logout successful
- `401 Unauthorized`: Invalid access token
- `400 Bad Request`: Invalid input data

### Email Verification

Verifies a user's email address using a token sent via email.

**Endpoint:** `GET /auth/verify-email?token=<verification_token>`

**Authentication Required:** No

**Response:**
- Redirects to web app with success/error parameters

**Status Codes:**
- `302 Found`: Redirect to success/error page

### Resend Verification Email

Resends the verification email to a user.

**Endpoint:** `POST /auth/resend-verification`

**Authentication Required:** No

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification email sent if the account exists"
}
```

**Status Codes:**
- `200 OK`: Email sent (or account doesn't exist)
- `400 Bad Request`: Invalid input data

### Forgot Password

Initiates the password reset process by sending a reset email.

**Endpoint:** `POST /auth/forgot-password`

**Authentication Required:** No

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent if the account exists"
}
```

**Status Codes:**
- `200 OK`: Email sent (or account doesn't exist)
- `400 Bad Request`: Invalid input data

### Reset Password (Form)

Gets the password reset form page or redirects to the web app.

**Endpoint:** `GET /auth/reset-password?token=<reset_token>`

**Authentication Required:** No

**Response:**
- Redirects to web app with token parameter

**Status Codes:**
- `302 Found`: Redirect to reset password page

### Reset Password (Submit)

Resets a user's password using a valid reset token.

**Endpoint:** `POST /auth/reset-password`

**Authentication Required:** No

**Request Body:**
```json
{
  "token": "abc123...",
  "password": "NewPassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Status Codes:**
- `200 OK`: Password reset successful
- `400 Bad Request`: Invalid token or password
- `401 Unauthorized`: Token expired

### Get User Profile

Retrieves the authenticated user's profile information.

**Endpoint:** `GET /auth/profile`

**Authentication Required:** Yes

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "name": "User Name",
  "role": "user",
  "emailVerified": true,
  "lastLogin": "2025-05-17T03:45:10.881Z",
  "createdAt": "2025-05-16T14:30:00.000Z"
}
```

**Status Codes:**
- `200 OK`: Profile retrieved successfully
- `401 Unauthorized`: Invalid access token
- `404 Not Found`: User not found

## Error Responses

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Error message here",
  "error": "Bad Request"
}
```

## Rate Limiting

Authentication endpoints are rate-limited:
- 10 requests per minute per IP address
- After 3 failed attempts for a specific email, additional rate limiting is applied

## Notes

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Password reset tokens expire after 1 hour
- Email verification tokens expire after 24 hours