
/**
 * Veritas - MCP-native research intelligence platform
 * Main Application Entry Point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './api/routes.js';
import { redis } from './redis/client.js';
import { prisma } from './database/client.js';
import { researchService } from './research-service.js';
import { requireProductionConfig } from './config/production.js';

const app = express();
const PORT = process.env.PORT || 3000;

requireProductionConfig();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
  credentials: true,
}));

// Pre-auth rate limiting must not trust caller-controlled headers.
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number.parseInt(process.env.MAX_PREAUTH_REQUESTS_PER_MINUTE || '100', 10),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retry_after: 60,
    });
  },
});
app.use(limiter);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (_req, res) => {
  const services = {
    database: 'disconnected',
    redis: 'disconnected',
    search: process.env.TAVILY_API_KEY || process.env.EXA_API_KEY ? 'connected' : 'disconnected',
    llm: process.env.OPENAI_API_KEY || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? 'connected' : 'disconnected',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = 'connected';
  } catch {
    services.database = 'disconnected';
  }

  try {
    await redis.ping();
    services.redis = 'connected';
  } catch {
    services.redis = 'disconnected';
  }

  const requiredInfrastructureHealthy = services.database === 'connected' && services.redis === 'connected';
  const optionalProvidersHealthy = services.search === 'connected' && services.llm === 'connected';
  const status = requiredInfrastructureHealthy
    ? optionalProvidersHealthy ? 'healthy' : 'degraded'
    : 'unhealthy';

  const statusCode = status === 'healthy' || (status === 'degraded' && process.env.NODE_ENV !== 'production')
    ? 200
    : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    services,
  });
});

// API routes
app.use('/', routes);

// Error handling
app.use((err: any, req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Veritas API running on port ${PORT}`);
  researchService.startWorker();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  researchService.stopWorker();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

export default app;
