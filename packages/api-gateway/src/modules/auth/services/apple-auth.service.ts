import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import * as appleSignin from 'apple-signin-auth';
import * as jwt from 'jsonwebtoken';

export interface AppleUserInfo {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  email_verified: boolean;
}

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private readonly clientId: string;
  private readonly teamId: string;
  private readonly keyId: string;
  private readonly privateKey: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('APPLE_CLIENT_ID');
    this.teamId = this.configService.get<string>('APPLE_TEAM_ID');
    this.keyId = this.configService.get<string>('APPLE_KEY_ID');
    this.privateKey = this.configService.get<string>('APPLE_PRIVATE_KEY', '');

    if (!this.clientId || !this.teamId || !this.keyId) {
      this.logger.warn('Apple Sign-In configuration incomplete');
    }
  }

  /**
   * Verify Apple ID token and extract user information
   */
  async verifyIdToken(
    idToken: string,
    nonce?: string,
    authorizationCode?: string,
  ): Promise<AppleUserInfo> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verify the identity token
        const decodedToken = await appleSignin.verifyIdToken(
          idToken,
          {
            audience: this.clientId,
            nonce: nonce,
          }
        );

        if (!decodedToken) {
          throw new UnauthorizedException('Invalid Apple ID token');
        }

        // Extract user information from the token
        const userInfo: AppleUserInfo = {
          id: decodedToken.sub,
          email: decodedToken.email,
          email_verified: decodedToken.email_verified === 'true',
        };

        // If we have an authorization code, we can get refresh token
        // This is only available on first sign-in
        if (authorizationCode && this.privateKey) {
          try {
            const clientSecret = this.generateClientSecret();
            const tokenResponse = await appleSignin.getAuthorizationToken(
              authorizationCode,
              {
                clientID: this.clientId,
                clientSecret,
                redirectUri: 'https://bookmarkai.app/auth/callback', // Update with actual redirect URI
              }
            );
            
            // We could store the refresh token for future use
            // but for now, we just log that we got it
            if (tokenResponse.refresh_token) {
              this.logger.debug('Received Apple refresh token');
            }
          } catch (error) {
            // Authorization code exchange is optional
            this.logger.warn('Failed to exchange authorization code', error);
          }
        }

        return userInfo;
      } catch (error) {
        // Don't retry on authentication errors
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        
        // Log retry attempts
        if (attempt < maxRetries) {
          this.logger.warn(
            `Apple token verification failed (attempt ${attempt}/${maxRetries}), retrying...`,
            error,
          );
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          continue;
        }
        
        // Final attempt failed
        this.logger.error('Failed to verify Apple ID token after retries', error);
        throw new UnauthorizedException('Failed to verify Apple credentials');
      }
    }
    
    // Should never reach here, but TypeScript needs this
    throw new UnauthorizedException('Failed to verify Apple credentials');
  }

  /**
   * Generate client secret for Apple Sign-In
   * Required for server-to-server communication
   */
  private generateClientSecret(): string {
    if (!this.privateKey) {
      throw new Error('Apple private key not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 86400 * 180; // 180 days

    const claims = {
      iss: this.teamId,
      iat: now,
      exp: expiry,
      aud: 'https://appleid.apple.com',
      sub: this.clientId,
    };

    return jwt.sign(claims, this.privateKey, {
      algorithm: 'ES256',
      keyid: this.keyId,
    });
  }

  /**
   * Decode user information from authorization response
   * Apple sends user info only on first authorization
   */
  decodeUserObject(userString?: string): { firstName?: string; lastName?: string } {
    if (!userString) {
      return {};
    }

    try {
      const user = JSON.parse(userString);
      return {
        firstName: user.name?.firstName,
        lastName: user.name?.lastName,
      };
    } catch {
      return {};
    }
  }
}