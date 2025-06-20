import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import { createHash, createPublicKey, createSign, createVerify } from 'crypto';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { KMS, SigningAlgorithmSpec } from '@aws-sdk/client-kms';

// Interface for JWT payload
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  jti: string; // JWT ID for blacklisting
  iss: string; // Issuer
  iat: number; // Issued at
  exp: number; // Expiration
}

// Interface for token response
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class KmsJwtService implements OnModuleInit {
  private readonly logger = new Logger(KmsJwtService.name);
  private readonly redis: Redis.Redis;
  private kms: KMS;
  private keyId: string;
  private useLocalKeys: boolean;
  private localPrivateKey: string;
  private localPublicKey: string;
  private cachedPublicKey: Buffer;
  
  constructor(private readonly configService: ConfigService) {
    // Initialize Redis client for token blacklisting
    this.redis = new Redis.Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
    
    // Get KMS key ID or use local fallback
    this.keyId = this.configService.get('TOKEN_KEY_ID', 'local');
    this.useLocalKeys = this.keyId === 'local';
    
    if (this.useLocalKeys) {
      this.logger.warn('Using local RSA keys for token signing/verification');
      const keysDir = path.join(process.cwd(), 'dev', 'keys');
      try {
        this.localPrivateKey = readFileSync(path.join(keysDir, 'private.pem'), 'utf8');
        this.localPublicKey = readFileSync(path.join(keysDir, 'public.pem'), 'utf8');
      } catch (error) {
        this.logger.error('Failed to load local RSA keys:', error);
        throw new Error('Failed to load local RSA keys. Run generate-keys.js script first.');
      }
    } else {
      // Initialize AWS KMS client
      this.kms = new KMS({
        region: this.configService.get('AWS_REGION', 'us-east-1'),
      });
    }
  }
  
  async onModuleInit() {
    try {
      // Cache the public key for verification to reduce KMS calls and handle outages
      if (!this.useLocalKeys) {
        const publicKey = await this.getPublicKey();
        this.cachedPublicKey = Buffer.from(publicKey);
        this.logger.log('Public key cached for verification');
      }
    } catch (error) {
      this.logger.error('Failed to cache public key:', error);
      if (this.useLocalKeys) {
        this.logger.warn('Continuing with local keys');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Create signed JWT tokens (access + refresh)
   */
  async createTokens(userId: string, email: string, role: string = 'user'): Promise<TokenResponse> {
    const jti = uuidv4();
    const iat = Math.floor(Date.now() / 1000);
    
    // Create access token (15 minutes)
    const accessTokenExpiry = iat + 15 * 60;
    const accessTokenPayload: JwtPayload = {
      sub: userId,
      email,
      role,
      jti,
      iss: 'bookmarkai',
      iat,
      exp: accessTokenExpiry,
    };
    
    // Create refresh token (7 days)
    const refreshTokenExpiry = iat + 7 * 24 * 60 * 60;
    const refreshTokenPayload: JwtPayload = {
      ...accessTokenPayload,
      jti: uuidv4(), // Different jti for refresh token
      exp: refreshTokenExpiry,
    };
    
    const [accessToken, refreshToken] = await Promise.all([
      this.signPayload(accessTokenPayload),
      this.signPayload(refreshTokenPayload),
    ]);
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }
  
  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      // Check token format
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      
      // Decode header and payload
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }
      
      // Check expiration with clock skew tolerance
      const now = Math.floor(Date.now() / 1000);
      const clockSkewTolerance = 30; // 30 seconds tolerance
      
      // Check if token is from the future (clock skew)
      if (payload.iat > (now + clockSkewTolerance)) {
        throw new Error('Token issued in the future');
      }
      
      // Check if token has expired
      if (payload.exp < (now - clockSkewTolerance)) {
        throw new Error('Token has expired');
      }
      
      // Verify signature
      const data = parts[0] + '.' + parts[1];
      const signature = Buffer.from(parts[2], 'base64');
      
      let isValid: boolean;
      if (this.useLocalKeys) {
        const verifier = createVerify('RSA-SHA256');
        verifier.update(data);
        isValid = verifier.verify(this.localPublicKey, signature);
      } else {
        // Use cached public key for verification to handle KMS outages
        const publicKey = createPublicKey(this.cachedPublicKey);
        const verifier = createVerify('RSA-SHA256');
        verifier.update(data);
        isValid = verifier.verify(publicKey, signature);
      }
      
      if (!isValid) {
        throw new Error('Invalid token signature');
      }
      
      return payload as JwtPayload;
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }
  
  /**
   * Blacklist a token by adding its JTI to Redis
   */
  async blacklistToken(jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
    }
  }
  
  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const exists = await this.redis.exists(`blacklist:${jti}`);
    return exists === 1;
  }
  
  /**
   * Hash a refresh token for storage
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  
  /**
   * Sign a payload using KMS or local key
   */
  private async signPayload(payload: JwtPayload): Promise<string> {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: this.keyId,
    };
    
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    
    let signature: Buffer;
    
    if (this.useLocalKeys) {
      // Use local key for development
      const signer = createSign('RSA-SHA256');
      signer.update(dataToSign);
      signature = Buffer.from(signer.sign(this.localPrivateKey, 'base64'), 'base64');
    } else {
      try {
        // Use KMS for production
        const signParams = {
          KeyId: this.keyId,
          Message: Buffer.from(dataToSign),
          SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' as SigningAlgorithmSpec,
        };
        
        const response = await this.kms.sign(signParams);
        
        if (!response || !response.Signature) {
          throw new Error('No signature returned from KMS');
        }
        
        signature = Buffer.from(response.Signature);
      } catch (error) {
        this.logger.error('KMS signing failed:', error);
        throw new Error('Failed to sign token with KMS');
      }
    }
    
    return `${dataToSign}.${signature.toString('base64url')}`;
  }
  
  /**
   * Get the public key from KMS for verification
   */
  private async getPublicKey(): Promise<Buffer> {
    try {
      const response = await this.kms.getPublicKey({
        KeyId: this.keyId,
      });
      
      if (!response || !response.PublicKey) {
        throw new Error('No public key returned from KMS');
      }
      
      return Buffer.from(response.PublicKey);
    } catch (error) {
      this.logger.error('Failed to get public key from KMS:', error);
      throw new Error('Failed to get public key from KMS');
    }
  }
}