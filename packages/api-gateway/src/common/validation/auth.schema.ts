import { z } from 'zod';

/**
 * Authentication validation schemas following ADR-012 conventions
 */

// Email validation with comprehensive rules
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .max(254, 'Email cannot exceed 254 characters');

// Password validation with security requirements
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

// Name validation
export const NameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name cannot exceed 100 characters')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes');

// JWT token validation
export const JwtTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, 'Invalid JWT token format');

// Refresh token validation
export const RefreshTokenSchema = z
  .string()
  .regex(/^rt_[a-f0-9-]+$/, 'Invalid refresh token format');

// Login request schema
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'), // Don't validate password complexity on login
});

// Register request schema
export const RegisterRequestSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    name: NameSchema,
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Password reset request schema
export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
});

// Password reset confirm schema
export const PasswordResetConfirmSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Change password schema
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

// Refresh token request schema
export const RefreshTokenRequestSchema = z.object({
  refreshToken: RefreshTokenSchema,
});

// Email verification schema
export const EmailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Resend verification email schema
export const ResendVerificationSchema = z.object({
  email: EmailSchema,
});

// Update profile schema
export const UpdateProfileSchema = z
  .object({
    name: NameSchema.optional(),
    email: EmailSchema.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// Two-factor authentication setup schema
export const TwoFactorSetupSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// Two-factor authentication verify schema
export const TwoFactorVerifySchema = z.object({
  code: z
    .string()
    .length(6, 'Code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Code must contain only digits'),
});

// Two-factor authentication login schema
export const TwoFactorLoginSchema = LoginRequestSchema.extend({
  twoFactorCode: z
    .string()
    .length(6, 'Two-factor code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Two-factor code must contain only digits'),
});

// Types
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type EmailVerification = z.infer<typeof EmailVerificationSchema>;
export type ResendVerification = z.infer<typeof ResendVerificationSchema>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
export type TwoFactorSetup = z.infer<typeof TwoFactorSetupSchema>;
export type TwoFactorVerify = z.infer<typeof TwoFactorVerifySchema>;
export type TwoFactorLogin = z.infer<typeof TwoFactorLoginSchema>;

/**
 * Helper to sanitize email for storage
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Helper to validate password strength
 */
export function getPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) score += 1;
  else feedback.push('Use at least 8 characters');

  if (password.length >= 12) score += 1;
  else if (password.length >= 8) feedback.push('Consider using 12+ characters for better security');

  // Character variety checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Include numbers');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('Include special characters');

  // Common patterns check
  if (!/(.)\1{2,}/.test(password)) score += 1;
  else feedback.push('Avoid repeating characters');

  return { score, feedback };
}
