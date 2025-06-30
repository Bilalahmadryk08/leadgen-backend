import express from 'express';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET= process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID, 
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI // This is enough here
);

// Step 1: Redirect user to Google Login
router.get('/google', (req, res) => {
  const { state } = req.query;
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'openid',
      'email',
      'profile',
    ],
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    state: state // Pass the state parameter through
  });
  res.redirect(authUrl);
});

// Step 2: Callback after login — send token back to frontend
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Store both access and refresh tokens
    const authData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date
    };

    // ✅ Redirect back to your frontend with complete auth data
    const redirectUrl = `${process.env.Vite_CLIENT_URL}/google-auth-success?authData=${encodeURIComponent(JSON.stringify(authData))}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

// Step 3: Refresh access token using refresh token
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  try {
    oauth2Client.setCredentials({
      refresh_token: refresh_token
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    const authData = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refresh_token, // Keep existing refresh token if new one not provided
      expires_at: credentials.expiry_date
    };

    res.json({ success: true, authData });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(401).json({ success: false, error: 'Failed to refresh token', needsReauth: true });
  }
});

// Step 4: Check if stored tokens are still valid
router.post('/validate', async (req, res) => {
  const { access_token, refresh_token, expires_at } = req.body;

  try {
    // Check if token is expired
    if (expires_at && Date.now() >= expires_at) {
      // Try to refresh the token
      oauth2Client.setCredentials({ refresh_token });
      const { credentials } = await oauth2Client.refreshAccessToken();

      const authData = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || refresh_token,
        expires_at: credentials.expiry_date
      };

      return res.json({ success: true, valid: true, authData });
    }

    // Token should still be valid, test it
    oauth2Client.setCredentials({ access_token });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.about.get({ fields: 'user' });

    res.json({ success: true, valid: true });
  } catch (err) {
    console.error('Token validation error:', err);
    res.json({ success: true, valid: false, needsReauth: true });
  }
});

export default router;
