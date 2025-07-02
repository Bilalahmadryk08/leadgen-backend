import express from 'express';
import { generateLeads, generateLeadsStream } from '../controllers/leadController.js';

const router = express.Router();

// This will match POST requests to /api/leads since it's mounted at /api/leads
router.post('/', generateLeads);

// Streaming endpoint for real-time progress
router.get('/stream', generateLeadsStream);

export default router;