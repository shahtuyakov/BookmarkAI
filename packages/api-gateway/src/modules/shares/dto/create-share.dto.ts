import { IsString, IsUrl, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating a share
 */
export class CreateShareDto {
  @ApiProperty({
    description: 'URL to share',
    example: 'https://www.tiktok.com/@username/video/1234567890',
  })
  @IsString({ message: 'URL must be a string' })
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  }, { message: 'URL must be a valid HTTPS URL' })
  @MaxLength(2048, { message: 'URL must be less than 2KB' })
  @Matches(/^https:\/\/(www\.)?(tiktok\.com|reddit\.com|twitter\.com|x\.com)/, {
    message: 'URL must be from a supported platform (TikTok, Reddit, Twitter, X)',
  })
  url: string;
}