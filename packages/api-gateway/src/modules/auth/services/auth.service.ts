import { Injectable, Logger, ConflictException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { PasswordService } from './password.service';
import { KmsJwtService, TokenResponse } from './kms-jwt.service';
import { EmailService } from './email.service';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { eq, and, lt, isNull, gt } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { users } from '../../../db/schema';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh.dto';
import { ResetPasswordRequestDto } from '../dto/reset-password-request.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DrizzleService,
    private readonly passwordService: PasswordService,
    private readonly kmsJwtService: KmsJwtService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto): Promise<TokenResponse> {
    const { email, name, password } = registerDto;

    try {
      // Check if user already exists
      const existingUser = await this.db.database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash the password
      const hashedPassword = await this.passwordService.hashPassword(password);

      // Generate refresh family ID
      const refreshFamilyId = uuidv4();

      // Generate verification token
      const verificationToken = this.generateToken();
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create the user
      const [newUser] = await this.db.database
        .insert(users)
        .values({
          email,
          name,
          password: hashedPassword,
          role: 'user',
          refreshFamilyId,
          emailVerified: false,
          verificationToken,
          verificationTokenExpiry,
          active: true,
        })
        .returning({ id: users.id, email: users.email, role: users.role, name: users.name });

      // Send verification email
      const emailSent = await this.emailService.sendVerificationEmail(
        email,
        name,
        verificationToken
      );

      if (!emailSent) {
        this.logger.warn(`Failed to send verification email to ${email}`);
      }

      // Generate tokens
      const tokens = await this.kmsJwtService.createTokens(newUser.id, newUser.email, newUser.role);

      // Store refresh token hash
      await this.storeRefreshToken(newUser.id, tokens.refreshToken, refreshFamilyId);

      return tokens;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Registration failed: ${error.message}`);
      throw new BadRequestException('Registration failed');
    }
  }

  /**
   * Login a user
   */
  async login(loginDto: LoginDto): Promise<TokenResponse> {
    const { email, password } = loginDto;

    try {
      // Find the user
      const user = await this.db.database
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user.length === 0) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const foundUser = user[0];

      // Verify password
      const isPasswordValid = await this.passwordService.verifyPassword(password, foundUser.password);

      if (!isPasswordValid) {
        // Update failed attempts counter
        await this.incrementFailedAttempts(foundUser.id);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Check if account is active
      if (!foundUser.active) {
        throw new UnauthorizedException('Account is inactive');
      }

      // Reset failed attempts on successful login
      if (foundUser.failedAttempts > 0) {
        await this.resetFailedAttempts(foundUser.id);
      }

      // Update last login timestamp
      await this.updateLastLogin(foundUser.id);

      // Generate a refresh family ID if it doesn't exist
      let refreshFamilyId = foundUser.refreshFamilyId;
      if (!refreshFamilyId) {
        refreshFamilyId = uuidv4();
        await this.updateRefreshFamilyId(foundUser.id, refreshFamilyId);
      }

      // Generate tokens
      const tokens = await this.kmsJwtService.createTokens(foundUser.id, foundUser.email, foundUser.role);

      // Store refresh token hash
      await this.storeRefreshToken(foundUser.id, tokens.refreshToken, refreshFamilyId);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Login failed: ${error.message}`);
      throw new BadRequestException('Login failed');
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<boolean> {
    try {
      // Find user with matching verification token and not expired
      const now = new Date();
      const user = await this.db.database
        .select()
        .from(users)
        .where(
          and(
            eq(users.verificationToken, token),
            eq(users.emailVerified, false),
            // Use gt (greater than) with column as first parameter
            gt(users.verificationTokenExpiry, now)
          )
        )
        .limit(1);

      if (user.length === 0) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      // Update user to mark email as verified
      await this.db.database
        .update(users)
        .set({
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null,
        })
        .where(eq(users.id, user[0].id));

      return true;
    } catch (error) {
      this.logger.error(`Email verification failed: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Email verification failed');
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<boolean> {
    try {
      // Find user by email
      const user = await this.db.database
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user.length === 0) {
        throw new NotFoundException('User not found');
      }

      const foundUser = user[0];

      // Check if email is already verified
      if (foundUser.emailVerified) {
        throw new BadRequestException('Email is already verified');
      }

      // Generate new verification token
      const verificationToken = this.generateToken();
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Update user with new token
      await this.db.database
        .update(users)
        .set({
          verificationToken,
          verificationTokenExpiry,
        })
        .where(eq(users.id, foundUser.id));

      // Send verification email
      const emailSent = await this.emailService.sendVerificationEmail(
        foundUser.email,
        foundUser.name,
        verificationToken
      );

      if (!emailSent) {
        this.logger.warn(`Failed to send verification email to ${foundUser.email}`);
        throw new BadRequestException('Failed to send verification email');
      }

      return true;
    } catch (error) {
      this.logger.error(`Resend verification email failed: ${error.message}`);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to resend verification email');
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(dto: ResetPasswordRequestDto): Promise<boolean> {
    const { email } = dto;

    try {
      // Find user by email
      const user = await this.db.database
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user.length === 0) {
        // Don't reveal if user exists
        return true;
      }

      const foundUser = user[0];

      // Check if account is active
      if (!foundUser.active) {
        // Don't reveal account status
        return true;
      }

      // Generate reset token
      const resetToken = this.generateToken();
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Update user with reset token
      await this.db.database
        .update(users)
        .set({
          resetPasswordToken: resetToken,
          resetPasswordTokenExpiry: resetTokenExpiry,
        })
        .where(eq(users.id, foundUser.id));

      // Send password reset email
      const emailSent = await this.emailService.sendPasswordResetEmail(
        foundUser.email,
        resetToken
      );

      if (!emailSent) {
        this.logger.warn(`Failed to send password reset email to ${foundUser.email}`);
        throw new BadRequestException('Failed to send password reset email');
      }

      return true;
    } catch (error) {
      this.logger.error(`Password reset request failed: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Password reset request failed');
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(dto: ResetPasswordDto): Promise<boolean> {
    const { token, password } = dto;

    try {
      // Find user with matching reset token and not expired
      const now = new Date();
      const user = await this.db.database
        .select()
        .from(users)
        .where(
          and(
            eq(users.resetPasswordToken, token),
            // Use gt (greater than) with column as first parameter
            gt(users.resetPasswordTokenExpiry, now)
          )
        )
        .limit(1);

      if (user.length === 0) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      const foundUser = user[0];

      // Hash the new password
      const hashedPassword = await this.passwordService.hashPassword(password);

      // Update user with new password and clear reset token
      await this.db.database
        .update(users)
        .set({
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordTokenExpiry: null,
        })
        .where(eq(users.id, foundUser.id));

      // Invalidate all refresh tokens for this user
      await this.db.database
        .update(users)
        .set({
          refreshHash: null,
          refreshFamilyId: uuidv4(), // Generate new family ID to invalidate all refresh tokens
        })
        .where(eq(users.id, foundUser.id));

      return true;
    } catch (error) {
      this.logger.error(`Password reset failed: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Password reset failed');
    }
  }

  /**
   * Refresh tokens
   */
  async refreshTokens(refreshDto: RefreshTokenDto): Promise<TokenResponse> {
    const { refreshToken } = refreshDto;

    try {
      // Verify the refresh token
      const payload = await this.kmsJwtService.verifyToken(refreshToken);

      // Get refresh token hash
      const tokenHash = this.kmsJwtService.hashRefreshToken(refreshToken);

      // Check if token exists in database
      const user = await this.db.database
        .select()
        .from(users)
        .where(and(
          eq(users.id, payload.sub),
          eq(users.refreshHash, tokenHash)
        ))
        .limit(1);

      if (user.length === 0) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const foundUser = user[0];

      // Make sure the user exists and is active
      if (!foundUser.active) {
        throw new UnauthorizedException('User is inactive');
      }

      // Blacklist the used refresh token
      await this.kmsJwtService.blacklistToken(payload.jti, payload.exp);

      // Generate new tokens
      const tokens = await this.kmsJwtService.createTokens(foundUser.id, foundUser.email, foundUser.role);

      // Store new refresh token hash
      await this.storeRefreshToken(foundUser.id, tokens.refreshToken, foundUser.refreshFamilyId);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token refresh failed: ${error.message}`);
      throw new BadRequestException('Token refresh failed');
    }
  }

  /**
   * Logout a user
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    try {
      // If refresh token is provided, verify and blacklist it
      if (refreshToken) {
        try {
          const payload = await this.kmsJwtService.verifyToken(refreshToken);
          await this.kmsJwtService.blacklistToken(payload.jti, payload.exp);
        } catch (error) {
          this.logger.warn(`Invalid refresh token during logout: ${error.message}`);
          // Continue with logout even if token is invalid
        }
      }

      // Clear the refresh token hash from the user record
      await this.db.database
        .update(users)
        .set({ refreshHash: null })
        .where(eq(users.id, userId));

    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`);
      throw new BadRequestException('Logout failed');
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string) {
    try {
      const user = await this.db.database
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          emailVerified: users.emailVerified,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        throw new NotFoundException('User not found');
      }

      return user[0];
    } catch (error) {
      this.logger.error(`Get user profile failed: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to get user profile');
    }
  }

  /**
   * Generate a random token
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Store a refresh token hash for a user
   */
  private async storeRefreshToken(userId: string, token: string, familyId: string): Promise<void> {
    const tokenHash = this.kmsJwtService.hashRefreshToken(token);

    await this.db.database
      .update(users)
      .set({ 
        refreshHash: tokenHash,
        refreshFamilyId: familyId
      })
      .where(eq(users.id, userId));
  }

  /**
   * Update the last login timestamp for a user
   */
  private async updateLastLogin(userId: string): Promise<void> {
    await this.db.database
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Increment failed login attempts
   */
  private async incrementFailedAttempts(userId: string): Promise<void> {
    // Get current failed attempts count
    const user = await this.db.database
      .select({ failedAttempts: users.failedAttempts })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    const currentAttempts = user[0]?.failedAttempts || 0;
    
    // Update with incremented value
    await this.db.database
      .update(users)
      .set({ 
        failedAttempts: currentAttempts + 1,
        failedAttemptsResetAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      })
      .where(eq(users.id, userId));
  }

  /**
   * Reset failed login attempts
   */
  private async resetFailedAttempts(userId: string): Promise<void> {
    await this.db.database
      .update(users)
      .set({ 
        failedAttempts: 0,
        failedAttemptsResetAt: null
      })
      .where(eq(users.id, userId));
  }

  /**
   * Update refresh family ID
   */
  private async updateRefreshFamilyId(userId: string, familyId: string): Promise<void> {
    await this.db.database
      .update(users)
      .set({ refreshFamilyId: familyId })
      .where(eq(users.id, userId));
  }
}