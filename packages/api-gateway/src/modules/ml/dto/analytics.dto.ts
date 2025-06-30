import { ApiProperty } from '@nestjs/swagger';

export class CostSummaryDto {
  @ApiProperty({ description: 'Period in hours' })
  periodHours: number;

  @ApiProperty({ description: 'Total cost in USD' })
  totalCostUsd: number;

  @ApiProperty({ description: 'Total audio duration in seconds' })
  totalDurationSeconds: number;

  @ApiProperty({ description: 'Total audio duration in hours' })
  totalDurationHours: number;

  @ApiProperty({ description: 'Number of transcriptions' })
  transcriptionCount: number;

  @ApiProperty({ description: 'Average cost per transcription' })
  avgCostPerTranscription: number;

  @ApiProperty({ description: 'Average duration in seconds' })
  avgDurationSeconds: number;

  @ApiProperty({ description: 'Cost per hour of audio' })
  costPerHour: number;

  @ApiProperty({ description: 'Cost breakdown by backend', required: false })
  breakdown?: {
    api: number;
    local: number;
  };
}

export class TranscriptionCostDto {
  @ApiProperty({ description: 'Share ID' })
  shareId: string;

  @ApiProperty({ description: 'Audio duration in seconds' })
  audioDurationSeconds: number;

  @ApiProperty({ description: 'Cost in USD' })
  billingUsd: number;

  @ApiProperty({ description: 'Backend used (api/local)' })
  backend: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

export class MLResultSummaryDto {
  @ApiProperty({ description: 'Task type' })
  taskType: string;

  @ApiProperty({ description: 'Number of tasks' })
  count: number;

  @ApiProperty({ description: 'Average processing time in milliseconds' })
  avgProcessingMs: number;

  @ApiProperty({ description: 'Total processing time in milliseconds' })
  totalProcessingMs: number;

  @ApiProperty({ description: 'Last processed timestamp' })
  lastProcessedAt: Date;
}

export class BudgetStatusDto {
  @ApiProperty({ description: 'Hourly budget status' })
  hourly: {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };

  @ApiProperty({ description: 'Daily budget status' })
  daily: {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };
}

export class DetailedCostsResponseDto {
  @ApiProperty({ description: 'List of costs', type: [TranscriptionCostDto] })
  costs: TranscriptionCostDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;
}