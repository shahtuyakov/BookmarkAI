import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { users } from '../../../db/schema';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { KmsJwtService } from './kms-jwt.service';
import { SocialProvider } from '../dto/social-auth.dto';
import { v4 as uuidv4 } from 'uuid';

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
    // Verify the Google ID token
    const googleUser = await this.googleAuthService.verifyIdToken(idToken);

    // Validate nonce if provided
    if (nonce && !this.googleAuthService.validateNonce({ nonce }, nonce)) {
      throw new UnauthorizedException('Invalid nonce');
    }

    // Find or create user
    return this.findOrCreateUser({
      provider: SocialProvider.GOOGLE,
      providerId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.picture,
      emailVerified: googleUser.email_verified,
    }, deviceInfo);
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
    // Verify the Apple ID token
    const appleUser = await this.appleAuthService.verifyIdToken(
      idToken,
      nonce,
      authorizationCode,
    );

    // Construct name from provided data or email
    const name = firstName || lastName 
      ? `${firstName || ''} ${lastName || ''}`.trim()
      : appleUser.email?.split('@')[0] || 'Apple User';

    // Find or create user
    return this.findOrCreateUser({
      provider: SocialProvider.APPLE,
      providerId: appleUser.id,
      email: appleUser.email,
      name,
      emailVerified: appleUser.email_verified,
    }, deviceInfo);
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
    // Note: We need to add provider and providerId columns to the users table
    // For now, we'll use email as the primary identifier
    
    // If email is provided, check if user exists
    if (socialProfile.email) {
      const existingUsers = await this.db.database
        .select()
        .from(users)
        .where(eq(users.email, socialProfile.email))
        .limit(1);

      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0];
        
        // Update last login
        await this.db.database
          .update(users)
          .set({ lastLogin: new Date() })
          .where(eq(users.id, existingUser.id));

        // Generate tokens
        const tokens = await this.kmsJwtService.createTokens(
          existingUser.id,
          existingUser.email,
          existingUser.role
        );

        // Store refresh token (we need to add this method)
        const refreshFamilyId = uuidv4();
        await this.storeRefreshToken(existingUser.id, tokens.refreshToken, refreshFamilyId);

        return { 
          user: existingUser, 
          isNewUser: false,
          tokens 
        };
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
      emailVerified: socialProfile.emailVerified,
      active: true,
      lastLogin: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert new user
    await this.db.database.insert(users).values(newUser);
    
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
   * Store refresh token hash in database
   */
  private async storeRefreshToken(userId: string, refreshToken: string, familyId: string): Promise<void> {
    // This is a simplified version - in production, you'd hash the token
    await this.db.database
      .update(users)
      .set({
        refreshHash: refreshToken, // Should be hashed in production
        refreshFamilyId: familyId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
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