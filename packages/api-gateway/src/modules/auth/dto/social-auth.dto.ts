import { IsString, IsNotEmpty, IsOptional, IsEnum, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export enum SocialProvider {
  GOOGLE = 'google',
  APPLE = 'apple',
}

export class DeviceInfoDto {
  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  version?: string;
}

export class SocialAuthDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @IsOptional()
  authorizationCode?: string;

  @IsString()
  @IsOptional()
  nonce?: string;

  @ValidateNested()
  @Type(() => DeviceInfoDto)
  @IsOptional()
  deviceInfo?: DeviceInfoDto;
}

export class GoogleAuthDto extends SocialAuthDto {
  // Google-specific fields can be added here if needed
}

export class AppleAuthDto extends SocialAuthDto {
  @IsString()
  @IsOptional()
  authorizationCode?: string; // Required for Apple

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;
}