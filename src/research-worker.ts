import { prisma } from './database/client.js';
import { redis } from './redis/client.js';
import { researchService } from './research-service.js';
import { requireProductionConfig } from './config/production.js';

requireProductionConfig();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, stopping research worker`);
  researchService.stopWorker();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
}

researchService.startWorker();
console.log('Veritas research worker running');

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
