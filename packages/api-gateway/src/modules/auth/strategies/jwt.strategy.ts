import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { KmsJwtService } from '../services/kms-jwt.service';
import { Request } from 'express';
import { ConfigService } from '../../../config/services/config.service';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly kmsJwtService: KmsJwtService,
    private readonly configService: ConfigService,
    private readonly db: DrizzleService,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        // Extract token from Authorization header or cookies
        let token = null;
        
        if (req.headers.authorization) {
          const [type, tokenValue] = req.headers.authorization.split(' ');
          if (type === 'Bearer') {
            token = tokenValue;
          }
        } else if (req.cookies && req.cookies.access_token) {
          token = req.cookies.access_token;
        }
        
        return token;
      },
      ignoreExpiration: false,
      secretOrKeyProvider: async (request, rawJwtToken, done) => {
        // We don't use this for verification since we handle it in kmsJwtService
        // But we need to provide something for passport-jwt
        done(null, 'dummy-key');
      },
      passReqToCallback: true,
    });
  }

  /**
   * Validate the JWT token and return the user
   */
  async validate(req: Request, payload: any) {
    try {
      // The token is already verified by kmsJwtService in the passport-jwt flow
      // Get the user from the database
      const result = await this.db.database
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, payload.sub))
        .limit(1);
      
      const user = result[0];
      
      if (!user || !user.active) {
        throw new UnauthorizedException('User not found or inactive');
      }
      
      // Return user data to be attached to request
      return {
        id: user.id,
        email: user.email,
        role: user.role,
      };
    } catch (error) {
      this.logger.error(`JWT validation failed: ${error.message}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}