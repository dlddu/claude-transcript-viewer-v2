/**
 * Backend Server Entry Point
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import transcriptRouter from './routes/transcript.js';
import s3Service from './services/s3.service.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const s3Connected = await s3Service.checkHealth();

    if (s3Connected) {
      res.json({
        status: 'healthy',
        s3: 'connected',
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        s3: 'disconnected',
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      s3: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API Routes
app.use('/api/transcript', transcriptRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Claude Transcript Viewer API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      transcript: '/api/transcript/:id',
      subagent: '/api/transcript/:id/subagent/:subagentId',
    },
  });
});

// Error handling middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

// Export app for testing
export default app;
