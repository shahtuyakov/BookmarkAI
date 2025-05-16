import { Controller, Get } from '@nestjs/common';
import { DrizzleService } from '../../../database/services/drizzle.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DrizzleService) {}

  @Get()
  async check() {
    // Check database connection
    const dbStatus = await this.checkDatabase();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    };
  }

  private async checkDatabase() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }
}
