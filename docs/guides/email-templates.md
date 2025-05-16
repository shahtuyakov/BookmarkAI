# Email Templates Guide

This document provides information about the email templates used in BookmarkAI for authentication and user management.

## Email Service Implementation

BookmarkAI uses a dual-mode email service:

1. **Development Mode**: Uses Ethereal (fake SMTP service) for testing
2. **Production Mode**: Uses Amazon SES for reliable delivery

### Configuration

The email service is configured via the following environment variables:

```
EMAIL_FROM=noreply@bookmarkai.example.com
USE_LOCAL_MAILER=true  # set to false for production
API_BASE_URL=http://localhost:3001
AWS_REGION=us-east-1  # for SES in production
```

### Development Testing

In development mode, the email service outputs preview URLs to the console, allowing you to view the emails without actually sending them:

```
[Nest] 32947 - 05/17/2025, 3:45:10 AM LOG [EmailService] Email preview URL: https://ethereal.email/message/...
```

## Email Templates

### Email Verification Template

Used to verify a user's email address after registration.

**Subject**: Verify your BookmarkAI account

**HTML Template**:

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Welcome to BookmarkAI!</h2>
  <p>Hello ${name},</p>
  <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${verifyUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
      Verify Email Address
    </a>
  </div>
  <p>Or copy and paste this link in your browser:</p>
  <p>${verifyUrl}</p>
  <p>This link will expire in 24 hours.</p>
  <p>If you didn't create an account, you can safely ignore this email.</p>
  <p>Best regards,<br>The BookmarkAI Team</p>
</div>
```

**Variables**:
- `${name}`: User's name
- `${verifyUrl}`: Email verification URL with token

### Password Reset Template

Used for the forgot password flow.

**Subject**: Reset your BookmarkAI password

**HTML Template**:

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Password Reset Request</h2>
  <p>Hello,</p>
  <p>We received a request to reset your password. Click the button below to set a new password:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${resetUrl}" style="background-color: #4285F4; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
      Reset Password
    </a>
  </div>
  <p>Or copy and paste this link in your browser:</p>
  <p>${resetUrl}</p>
  <p>This link will expire in 1 hour.</p>
  <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
  <p>Best regards,<br>The BookmarkAI Team</p>
</div>
```

**Variables**:
- `${resetUrl}`: Password reset URL with token

## Email Sending Logic

### Verification Email Logic

```typescript
// Send verification email on registration
async function register(user) {
  // ... user creation logic ...
  
  // Generate verification token
  const verificationToken = generateSecureToken();
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  // Store token in database
  await storeVerificationToken(user.id, verificationToken, verificationTokenExpiry);
  
  // Send verification email
  await emailService.sendVerificationEmail(
    user.email,
    user.name,
    verificationToken
  );
  
  // ... return tokens ...
}
```

### Password Reset Email Logic

```typescript
// Send password reset email
async function requestPasswordReset(email) {
  // Find user (don't reveal if exists)
  const user = await findUserByEmail(email);
  
  if (user) {
    // Generate reset token
    const resetToken = generateSecureToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Store token in database
    await storeResetToken(user.id, resetToken, resetTokenExpiry);
    
    // Send reset email
    await emailService.sendPasswordResetEmail(
      user.email,
      resetToken
    );
  }
  
  // Always return success (don't reveal if user exists)
  return { success: true };
}
```

## Custom Template Creation

To modify email templates:

1. Update the template HTML in `EmailService` methods:
   - `sendVerificationEmail()`
   - `sendPasswordResetEmail()`

2. Keep these design considerations in mind:
   - Use inline CSS styles for better email client compatibility
   - Keep template designs responsive for mobile devices
   - Provide both button and text link options for accessibility
   - Include clear branding elements

## Future Enhancements

Planned improvements for the email system:

1. **External Template Files**: Move templates to separate HTML files
2. **Templating Engine**: Integrate a proper templating engine like Handlebars
3. **Localization**: Support for multiple languages
4. **Tracking**: Email open and click tracking
5. **Custom Templates**: Allow users to customize email templates

## Troubleshooting

Common issues with email delivery:

1. **Emails not showing in development**:
   - Check console for Ethereal preview URL
   - Verify that `USE_LOCAL_MAILER=true` is set

2. **Emails not sending in production**:
   - Verify AWS SES is properly configured
   - Check that the sending email is verified in SES
   - Ensure IAM permissions are set correctly
   - Check SES sending quotas

3. **Template rendering issues**:
   - Verify all template variables are being correctly replaced
   - Test templates in different email clients for compatibility