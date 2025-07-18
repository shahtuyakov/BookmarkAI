import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { SocialAuthController } from './controllers/social-auth.controller';
import { TestController } from './controllers/test.controller';
import { AuthService } from './services/auth.service';
import { SocialAuthService } from './services/social-auth.service';
import { GoogleAuthService } from './services/google-auth.service';
import { AppleAuthService } from './services/apple-auth.service';
import { KmsJwtService } from './services/kms-jwt.service';
import { PasswordService } from './services/password.service';
import { EmailService } from './services/email.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuthController, SocialAuthController, TestController],
  providers: [
    AuthService,
    SocialAuthService,
    GoogleAuthService,
    AppleAuthService,
    KmsJwtService,
    PasswordService,
    EmailService,
    JwtStrategy,
    // Apply JWT auth guard globally, but allow overrides with @Public() decorator
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Apply roles guard globally
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService, SocialAuthService, KmsJwtService, PasswordService, EmailService],
})
export class AuthModule {}