import express from 'express';
import { generateLeads } from '../controllers/leadController.js';

const router = express.Router();

// This will match POST requests to /api/leads since it's mounted at /api/leads
router.post('/', generateLeads);

export default router;