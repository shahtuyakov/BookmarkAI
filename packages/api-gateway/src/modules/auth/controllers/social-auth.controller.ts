import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { Public } from '../decorators/public.decorator';
import { HttpsOnlyGuard } from '../guards/https-only.guard';
import { SocialAuthService } from '../services/social-auth.service';
import { AuthMetricsService } from '../services/auth-metrics.service';
import { GoogleAuthDto, AppleAuthDto } from '../dto/social-auth.dto';
import { ConfigService } from '../../../config/services/config.service';

@ApiTags('auth')
@Controller('v1/auth/social')
@UseGuards(HttpsOnlyGuard)
export class SocialAuthController {
  private readonly socialAuthEnabled: boolean;

  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly authMetricsService: AuthMetricsService,
    private readonly configService: ConfigService,
  ) {
    this.socialAuthEnabled = this.configService.get<boolean>('SOCIAL_AUTH_ENABLED', false);
  }

  /**
   * Google Sign-In
   */
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Google' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 503, description: 'Social authentication is disabled' })
  async googleSignIn(
    @Body() dto: GoogleAuthDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Check if social auth is enabled
    if (!this.socialAuthEnabled) {
      throw new ServiceUnavailableException('Social authentication is currently disabled');
    }

    const startTime = Date.now();
    this.authMetricsService.recordAuthAttempt('google', 'social');

    try {
      // Authenticate with Google
      const result = await this.socialAuthService.authenticateGoogle(
        dto.idToken,
        dto.nonce,
        dto.deviceInfo,
      );

      // Record metrics
      const latencySeconds = (Date.now() - startTime) / 1000;
      this.authMetricsService.recordAuthLatency('google', latencySeconds, 'social');
      this.authMetricsService.recordAuthSuccess('google', 'social', result.isNewUser);

      // Set cookie for web clients
      if (this.isWebClient(request)) {
        this.setCookieToken(response, result.tokens.accessToken);
      }

      return {
        ...result.tokens,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          provider: 'google',
          isNewUser: result.isNewUser,
        },
      };
    } catch (error) {
      // Record failure metrics
      const errorType = error instanceof UnauthorizedException ? 'invalid_token' : 'provider_error';
      this.authMetricsService.recordAuthFailure('google', 'social', errorType);
      
      // Log the error for monitoring
      console.error('Google authentication failed:', error);
      
      // Return user-friendly error with fallback suggestion
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(
          'Google authentication failed. Please try again or use email/password login.'
        );
      }
      
      throw new ServiceUnavailableException(
        'Google authentication is temporarily unavailable. Please use email/password login or try again later.'
      );
    }
  }

  /**
   * Apple Sign-In
   */
  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Apple' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 503, description: 'Social authentication is disabled' })
  async appleSignIn(
    @Body() dto: AppleAuthDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Check if social auth is enabled
    if (!this.socialAuthEnabled) {
      throw new ServiceUnavailableException('Social authentication is currently disabled');
    }

    const startTime = Date.now();
    this.authMetricsService.recordAuthAttempt('apple', 'social');

    try {
      // Authenticate with Apple
      const result = await this.socialAuthService.authenticateApple(
        dto.idToken,
        dto.authorizationCode,
        dto.nonce,
        dto.firstName,
        dto.lastName,
        dto.deviceInfo,
      );

      // Record metrics
      const latencySeconds = (Date.now() - startTime) / 1000;
      this.authMetricsService.recordAuthLatency('apple', latencySeconds, 'social');
      this.authMetricsService.recordAuthSuccess('apple', 'social', result.isNewUser);

      // Set cookie for web clients
      if (this.isWebClient(request)) {
        this.setCookieToken(response, result.tokens.accessToken);
      }

      return {
        ...result.tokens,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          provider: 'apple',
          isNewUser: result.isNewUser,
        },
      };
    } catch (error) {
      // Record failure metrics
      const errorType = error instanceof UnauthorizedException ? 'invalid_token' : 'provider_error';
      this.authMetricsService.recordAuthFailure('apple', 'social', errorType);
      
      // Log the error for monitoring
      console.error('Apple authentication failed:', error);
      
      // Return user-friendly error with fallback suggestion
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(
          'Apple authentication failed. Please try again or use email/password login.'
        );
      }
      
      throw new ServiceUnavailableException(
        'Apple authentication is temporarily unavailable. Please use email/password login or try again later.'
      );
    }
  }

  /**
   * Check if request is from web client
   */
  private isWebClient(request: Request): boolean {
    const userAgent = request.headers['user-agent'] || '';
    return !userAgent.includes('BookmarkAI-Mobile');
  }

  /**
   * Set JWT token as HTTP-only cookie for web clients
   */
  private setCookieToken(response: Response, token: string): void {
    response.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
}