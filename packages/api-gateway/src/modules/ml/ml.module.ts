import { Module } from '@nestjs/common';
import { MLProducerService } from './ml-producer.service';

@Module({
  imports: [],
  providers: [MLProducerService],
  exports: [MLProducerService],
})
export class MLModule {}