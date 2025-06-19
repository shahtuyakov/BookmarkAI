import { Body, Controller, Post, HttpCode, HttpStatus, UseGuards, Req, Res, Logger, Get, Query } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh.dto';
import { ResetPasswordRequestDto } from '../dto/reset-password-request.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Request, Response } from 'express';
import { ConfigService } from '../../../config/services/config.service';

@Controller('v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly isProduction: boolean;
  private readonly webAppUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction = this.configService.isProduction();
    this.webAppUrl = this.configService.get('WEB_APP_URL', 'http://localhost:3000');
  }

  /**
   * Register a new user
   */
  @Public()
  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.logger.log(`Registration attempt for email: ${registerDto.email}`);
    
    const tokens = await this.authService.register(registerDto);
    
    // For web clients, set the access token as an HttpOnly cookie
    this.setCookieIfWeb(response, tokens.accessToken);
    
    return {
      ...tokens,
      user: {
        email: registerDto.email,
        name: registerDto.name,
      },
    };
  }

  /**
   * Login a user
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.logger.log(`Login attempt for email: ${loginDto.email}`);
    
    const tokens = await this.authService.login(loginDto);
    
    // For web clients, set the access token as an HttpOnly cookie
    this.setCookieIfWeb(response, tokens.accessToken);
    
    return tokens;
  }

  /**
   * Refresh tokens
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshDto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.refreshTokens(refreshDto);
    
    // For web clients, set the access token as an HttpOnly cookie
    this.setCookieIfWeb(response, tokens.accessToken);
    
    return tokens;
  }

  /**
   * Logout user
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = request.user as { id: string };
    
    // Clear the cookie for web clients
    this.clearCookieIfWeb(response);
    
    await this.authService.logout(user.id, body.refreshToken);
    
    return { success: true };
  }

  /**
   * Verify email
   */
  @Public()
  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
    @Res() response: Response,
  ) {
    try {
      await this.authService.verifyEmail(token);
      
      // Redirect to the web app with success message
      return response.redirect(`${this.webAppUrl}/auth/email-verified?success=true`);
    } catch (error) {
      // Redirect to the web app with error message
      return response.redirect(`${this.webAppUrl}/auth/email-verified?success=false&error=${error.message}`);
    }
  }

  /**
   * Resend verification email
   */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerificationEmail(dto.email);
    return { success: true, message: 'Verification email sent if the account exists' };
  }

  /**
   * Request password reset
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ResetPasswordRequestDto) {
    await this.authService.requestPasswordReset(dto);
    return { success: true, message: 'Password reset email sent if the account exists' };
  }

  /**
   * Reset password with token (form submission)
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { success: true, message: 'Password has been reset successfully' };
  }

  /**
   * Get reset password form (page render or redirect)
   */
  @Public()
  @Get('reset-password')
  async getResetPasswordPage(
    @Query('token') token: string,
    @Res() response: Response,
  ) {
    // Redirect to the web app reset password page with the token
    return response.redirect(`${this.webAppUrl}/auth/reset-password?token=${token}`);
  }

  /**
   * Get user profile
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() request: Request) {
    const user = request.user as { id: string };
    return this.authService.getUserProfile(user.id);
  }

  /**
   * Set access token cookie for web clients
   */
  private setCookieIfWeb(response: Response, token: string): void {
    // Fastify and Express have different request structures
    // For Fastify, we need to check the headers directly
    const isWeb = response.hasOwnProperty('raw') && 
                  response['raw'].hasOwnProperty('req') && 
                  response['raw'].req.headers &&
                  response['raw'].req.headers.accept && 
                  response['raw'].req.headers.accept.includes('text/html');
    
    if (isWeb) {
      response.cookie('access_token', token, {
        httpOnly: true,
        secure: this.isProduction, // Only secure in production
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes in milliseconds
      });
    }
  }

  /**
   * Clear access token cookie for web clients
   */
  private clearCookieIfWeb(response: Response): void {
    // Fastify and Express have different request structures
    // For Fastify, we need to check the headers directly
    const isWeb = response.hasOwnProperty('raw') && 
                  response['raw'].hasOwnProperty('req') && 
                  response['raw'].req.headers &&
                  response['raw'].req.headers.accept && 
                  response['raw'].req.headers.accept.includes('text/html');
    
    if (isWeb) {
      response.clearCookie('access_token');
    }
  }
}