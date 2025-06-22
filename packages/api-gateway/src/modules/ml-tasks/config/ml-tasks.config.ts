import { registerAs } from '@nestjs/config';

export const mlTasksConfig = registerAs('mlTasks', () => ({
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    user: process.env.RABBITMQ_USER || 'ml',
    pass: process.env.RABBITMQ_PASS || 'ml_password',
    vhost: process.env.RABBITMQ_VHOST || '/',
  },
  queues: {
    transcribe: 'ml.transcribe',
    summarize: 'ml.summarize',
    embed: 'ml.embed',
  },
  exchange: {
    name: 'ml.tasks',
    type: 'topic',
  },
  taskDefaults: {
    priority: 5,
    ttl: 300000, // 5 minutes
  },
}));