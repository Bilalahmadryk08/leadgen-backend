import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import leadRoutes from './routes/leadRoutes.js';
import exportRoutes from './routes/exportRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/leads', leadRoutes);
app.use('/api/export', exportRoutes);

export default app;
