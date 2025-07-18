import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { Public } from '../decorators/public.decorator';
import { SocialAuthService } from '../services/social-auth.service';
import { GoogleAuthDto, AppleAuthDto } from '../dto/social-auth.dto';

@ApiTags('auth')
@Controller('v1/auth/social')
export class SocialAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
  ) {}

  /**
   * Google Sign-In
   */
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Google' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async googleSignIn(
    @Body() dto: GoogleAuthDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Authenticate with Google
    const result = await this.socialAuthService.authenticateGoogle(
      dto.idToken,
      dto.nonce,
    );

    // Set cookie for web clients
    if (this.isWebClient(request)) {
      this.setCookieToken(response, result.tokens.accessToken);
    }

    // Log device info if provided
    if (dto.deviceInfo) {
      // Could be used for device tracking/security in the future
      console.log(`Google sign-in from ${dto.deviceInfo.platform} ${dto.deviceInfo.version}`);
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
  async appleSignIn(
    @Body() dto: AppleAuthDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Authenticate with Apple
    const result = await this.socialAuthService.authenticateApple(
      dto.idToken,
      dto.authorizationCode,
      dto.nonce,
      dto.firstName,
      dto.lastName,
    );

    // Set cookie for web clients
    if (this.isWebClient(request)) {
      this.setCookieToken(response, result.tokens.accessToken);
    }

    // Log device info if provided
    if (dto.deviceInfo) {
      console.log(`Apple sign-in from ${dto.deviceInfo.platform} ${dto.deviceInfo.version}`);
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