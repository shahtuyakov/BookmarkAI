import { Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';

/**
 * Interface for share data
 */
export interface Share {
  id: string;
  userId: string;
  url: string;
  platform: Platform;
  status: ShareStatus;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}