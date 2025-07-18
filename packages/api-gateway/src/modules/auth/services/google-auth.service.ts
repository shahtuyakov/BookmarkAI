import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly oauth2Client: OAuth2Client;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    
    if (!this.clientId) {
      this.logger.warn('Google Client ID not configured');
    }

    this.oauth2Client = new OAuth2Client(this.clientId);
  }

  /**
   * Verify Google ID token and extract user information
   */
  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const ticket = await this.oauth2Client.verifyIdToken({
          idToken,
          audience: this.clientId,
        });

        const payload = ticket.getPayload();
        
        if (!payload) {
          throw new UnauthorizedException('Invalid Google ID token');
        }

        // Verify token hasn't expired
        const currentTime = Math.floor(Date.now() / 1000);
        if (payload.exp < currentTime) {
          throw new UnauthorizedException('Google ID token has expired');
        }

        // Extract user information
        return {
          id: payload.sub,
          email: payload.email!,
          name: payload.name || payload.email!.split('@')[0],
          picture: payload.picture,
          email_verified: payload.email_verified || false,
        };
      } catch (error) {
        // Don't retry on authentication errors
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        
        // Log retry attempts
        if (attempt < maxRetries) {
          this.logger.warn(
            `Google token verification failed (attempt ${attempt}/${maxRetries}), retrying...`,
            error,
          );
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          continue;
        }
        
        // Final attempt failed
        this.logger.error('Failed to verify Google ID token after retries', error);
        throw new UnauthorizedException('Failed to verify Google credentials');
      }
    }
    
    // Should never reach here, but TypeScript needs this
    throw new UnauthorizedException('Failed to verify Google credentials');
  }

  /**
   * Validate nonce if provided (for additional security)
   */
  validateNonce(payload: any, nonce?: string): boolean {
    if (!nonce) return true;
    
    return payload.nonce === nonce;
  }
}