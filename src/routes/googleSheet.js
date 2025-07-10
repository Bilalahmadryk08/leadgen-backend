import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

router.post('/fetch', async (req, res) => {
  const { spreadsheetId, range } = req.body;

  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values;

    const leads = rows.slice(1).map(row => ({ email: row[0], name: row[1] }));
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
