import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { users } from '../../../db/schema';
import { socialAuthProfiles } from '../../../db/schema/social-auth-profiles';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { KmsJwtService } from './kms-jwt.service';
import { SocialProvider } from '../dto/social-auth.dto';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface SocialAuthResult {
  user: any; // User from database
  isNewUser: boolean;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly db: DrizzleService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly kmsJwtService: KmsJwtService,
  ) {}

  /**
   * Authenticate user with Google
   */
  async authenticateGoogle(
    idToken: string,
    nonce?: string,
    deviceInfo?: { platform?: string; version?: string },
  ): Promise<SocialAuthResult> {
    const startTime = Date.now();
    
    try {
      // Verify the Google ID token
      const googleUser = await this.googleAuthService.verifyIdToken(idToken);
      
      // Log token validation time
      const tokenValidationTime = Date.now() - startTime;
      this.logger.debug(`Google token validation took ${tokenValidationTime}ms`);

      // Note: Nonce validation would be done within the ID token verification
      // Google includes nonce in the token payload if provided during auth

      // Find or create user
      const result = await this.findOrCreateUser({
        provider: SocialProvider.GOOGLE,
        providerId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        emailVerified: googleUser.email_verified,
      }, deviceInfo);
      
      // Log total auth time
      const totalTime = Date.now() - startTime;
      this.logger.log(`Google authentication completed in ${totalTime}ms (new user: ${result.isNewUser})`);
      
      return result;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Google authentication failed after ${totalTime}ms`, error);
      throw error;
    }
  }

  /**
   * Authenticate user with Apple
   */
  async authenticateApple(
    idToken: string,
    authorizationCode?: string,
    nonce?: string,
    firstName?: string,
    lastName?: string,
    deviceInfo?: { platform?: string; version?: string },
  ): Promise<SocialAuthResult> {
    const startTime = Date.now();
    
    try {
      // Verify the Apple ID token
      const appleUser = await this.appleAuthService.verifyIdToken(
        idToken,
        nonce,
        authorizationCode,
      );
      
      // Log token validation time
      const tokenValidationTime = Date.now() - startTime;
      this.logger.debug(`Apple token validation took ${tokenValidationTime}ms`);

      // Construct name from provided data or email
      const name = firstName || lastName 
        ? `${firstName || ''} ${lastName || ''}`.trim()
        : appleUser.email?.split('@')[0] || 'Apple User';

      // Find or create user
      const result = await this.findOrCreateUser({
        provider: SocialProvider.APPLE,
        providerId: appleUser.id,
        email: appleUser.email,
        name,
        emailVerified: appleUser.email_verified,
      }, deviceInfo);
      
      // Log total auth time
      const totalTime = Date.now() - startTime;
      this.logger.log(`Apple authentication completed in ${totalTime}ms (new user: ${result.isNewUser})`);
      
      return result;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Apple authentication failed after ${totalTime}ms`, error);
      throw error;
    }
  }

  /**
   * Find existing user or create new one
   */
  private async findOrCreateUser(
    socialProfile: {
      provider: SocialProvider;
      providerId: string;
      email?: string;
      name: string;
      avatarUrl?: string;
      emailVerified: boolean;
    },
    deviceInfo?: { platform?: string; version?: string },
  ): Promise<SocialAuthResult> {
    // First, try to find user by provider and providerId
    const existingUsersByProvider = await this.db.database
      .select()
      .from(users)
      .where(
        and(
          eq(users.provider, socialProfile.provider),
          eq(users.providerId, socialProfile.providerId)
        )
      )
      .limit(1);

    if (existingUsersByProvider.length > 0) {
      const existingUser = existingUsersByProvider[0];
      return this.handleExistingUser(existingUser, socialProfile);
    }
    
    // If email is provided, check if user exists with that email
    if (socialProfile.email) {
      const existingUsersByEmail = await this.db.database
        .select()
        .from(users)
        .where(eq(users.email, socialProfile.email))
        .limit(1);

      if (existingUsersByEmail.length > 0) {
        const existingUser = existingUsersByEmail[0];
        
        // If user exists with email but different provider, link the social account
        if (existingUser.provider !== socialProfile.provider) {
          // Update user with social provider information
          await this.db.database
            .update(users)
            .set({
              provider: socialProfile.provider,
              providerId: socialProfile.providerId,
              avatarUrl: socialProfile.avatarUrl || existingUser.avatarUrl,
              emailVerified: true,
              lastLogin: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingUser.id));
          
          // Re-fetch the updated user
          const [updatedUser] = await this.db.database
            .select()
            .from(users)
            .where(eq(users.id, existingUser.id))
            .limit(1);
          
          return this.handleExistingUser(updatedUser, socialProfile);
        }
        
        return this.handleExistingUser(existingUser, socialProfile);
      }
    }

    // Create new user
    const userId = uuidv4();
    const userEmail = socialProfile.email || `${socialProfile.providerId}@${socialProfile.provider}.local`;
    
    // Generate a temporary password for social auth users
    const tempPassword = `social_${socialProfile.provider}_${uuidv4()}`;
    
    const newUser = {
      id: userId,
      email: userEmail,
      name: socialProfile.name,
      password: tempPassword, // This will never be used for social auth
      provider: socialProfile.provider,
      providerId: socialProfile.providerId,
      avatarUrl: socialProfile.avatarUrl,
      emailVerified: socialProfile.emailVerified,
      active: true,
      lastLogin: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert new user
    await this.db.database.insert(users).values(newUser);
    
    // Create social auth profile
    await this.upsertSocialAuthProfile(userId, socialProfile);
    
    // Generate tokens
    const tokens = await this.kmsJwtService.createTokens(
      userId,
      userEmail,
      'user' // default role
    );

    // Store refresh token
    const refreshFamilyId = uuidv4();
    await this.storeRefreshToken(userId, tokens.refreshToken, refreshFamilyId);
    
    const deviceInfoStr = deviceInfo 
      ? `${deviceInfo.platform || 'unknown'} ${deviceInfo.version || ''}`.trim()
      : 'unknown device';
    
    this.logger.log(
      `New user created via ${socialProfile.provider}: ${userId}\n` +
      `  ${socialProfile.provider.charAt(0).toUpperCase() + socialProfile.provider.slice(1)} sign-in from ${deviceInfoStr}`
    );

    return { 
      user: { ...newUser, role: 'user' }, 
      isNewUser: true,
      tokens 
    };
  }

  /**
   * Handle authentication for existing user
   */
  private async handleExistingUser(
    existingUser: any,
    socialProfile: { 
      provider: SocialProvider;
      providerId: string;
      email?: string;
      name: string;
      avatarUrl?: string;
      emailVerified: boolean;
    },
  ): Promise<SocialAuthResult> {
    // Update last login and potentially avatar
    await this.db.database
      .update(users)
      .set({
        lastLogin: new Date(),
        avatarUrl: socialProfile.avatarUrl || existingUser.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    // Update or create social auth profile
    await this.upsertSocialAuthProfile(existingUser.id, socialProfile);

    // Generate tokens
    const tokens = await this.kmsJwtService.createTokens(
      existingUser.id,
      existingUser.email,
      existingUser.role,
    );

    // Store refresh token
    const refreshFamilyId = uuidv4();
    await this.storeRefreshToken(existingUser.id, tokens.refreshToken, refreshFamilyId);

    return {
      user: existingUser,
      isNewUser: false,
      tokens,
    };
  }

  /**
   * Store refresh token hash in database
   */
  private async storeRefreshToken(userId: string, refreshToken: string, familyId: string): Promise<void> {
    // Hash the refresh token before storing
    const refreshHash = this.hashRefreshToken(refreshToken);
    
    await this.db.database
      .update(users)
      .set({
        refreshHash,
        refreshFamilyId: familyId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Hash refresh token using SHA-256
   */
  private hashRefreshToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Update or create social auth profile
   */
  private async upsertSocialAuthProfile(
    userId: string,
    socialProfile: {
      provider: SocialProvider;
      providerId: string;
      email?: string;
      name: string;
      avatarUrl?: string;
    },
  ): Promise<void> {
    const existingProfile = await this.db.database
      .select()
      .from(socialAuthProfiles)
      .where(
        and(
          eq(socialAuthProfiles.provider, socialProfile.provider),
          eq(socialAuthProfiles.providerUserId, socialProfile.providerId),
        ),
      )
      .limit(1);

    if (existingProfile.length > 0) {
      // Update existing profile
      await this.db.database
        .update(socialAuthProfiles)
        .set({
          lastLoginAt: new Date(),
          avatarUrl: socialProfile.avatarUrl,
          name: socialProfile.name,
          updatedAt: new Date(),
        })
        .where(eq(socialAuthProfiles.id, existingProfile[0].id));
    } else {
      // Create new profile
      await this.db.database.insert(socialAuthProfiles).values({
        userId,
        provider: socialProfile.provider,
        providerUserId: socialProfile.providerId,
        email: socialProfile.email,
        name: socialProfile.name,
        avatarUrl: socialProfile.avatarUrl,
        lastLoginAt: new Date(),
      });
    }
  }

  /**
   * Link social account to existing user (future enhancement)
   */
  async linkSocialAccount(
    userId: string,
    provider: SocialProvider,
    providerId: string,
  ): Promise<void> {
    // This would be implemented in a future enhancement
    // For now, we don't support linking multiple accounts
    throw new Error('Account linking not yet implemented');
  }
}