import { Injectable, Logger, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { PasswordService } from './password.service';
import { KmsJwtService, TokenResponse } from './kms-jwt.service';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { users } from '../../../db/schema';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DrizzleService,
    private readonly passwordService: PasswordService,
    private readonly kmsJwtService: KmsJwtService
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

      // Create the user
      const [newUser] = await this.db.database
        .insert(users)
        .values({
          email,
          name,
          password: hashedPassword,
          role: 'user',
          refreshFamilyId,
        })
        .returning({ id: users.id, email: users.email, role: users.role });

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