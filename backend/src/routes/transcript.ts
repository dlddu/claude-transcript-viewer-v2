/**
 * Transcript API Routes
 */

import express, { Request, Response } from 'express';
import s3Service from '../services/s3.service.js';

const router = express.Router();

/**
 * Validate transcript ID format
 */
function isValidTranscriptId(id: string): boolean {
  // Only allow alphanumeric, hyphens, and underscores
  // Prevent path traversal attacks
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * GET /api/transcript/:id
 * Fetch main transcript by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate transcript ID
    if (!isValidTranscriptId(id)) {
      return res.status(400).json({
        error: 'Invalid transcript ID format',
      });
    }

    const transcript = await s3Service.getTranscript(id);
    res.json(transcript);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'Transcript not found') {
      return res.status(404).json({
        error: 'Transcript not found',
      });
    }

    console.error('Error fetching transcript:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/transcript/:id/subagent/:subagentId
 * Fetch subagent transcript
 */
router.get('/:id/subagent/:subagentId', async (req: Request, res: Response) => {
  try {
    const { subagentId } = req.params;

    // Validate subagent ID
    if (!isValidTranscriptId(subagentId)) {
      return res.status(400).json({
        error: 'Invalid transcript ID format',
      });
    }

    const transcript = await s3Service.getTranscript(subagentId);
    res.json(transcript);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'Transcript not found') {
      return res.status(404).json({
        error: 'Subagent transcript not found',
      });
    }

    console.error('Error fetching subagent transcript:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: errorMessage,
    });
  }
});

export default router;
