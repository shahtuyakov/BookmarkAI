import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  
  /**
   * Hash a password with Argon2id
   */
  async hashPassword(password: string): Promise<string> {
    try {
      // Using Argon2id with parameters from ADR-0002
      // Memory: 4MB, Iterations: 3
      const hash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 4096, // 4MB
        timeCost: 3,      // 3 iterations
        parallelism: 1,   // single-threaded
        // Note: saltLength isn't supported directly, argon2 generates a secure salt automatically
      });
      
      return hash;
    } catch (error) {
      this.logger.error('Password hashing failed:', error);
      throw new Error('Password hashing failed');
    }
  }
  
  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      this.logger.error('Password verification failed:', error);
      throw new Error('Password verification failed');
    }
  }
}