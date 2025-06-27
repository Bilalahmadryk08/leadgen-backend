import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

// Route to list existing Google Sheets
router.post('/google-sheets/list', async (req, res) => {
  const { token } = req.body;

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });

    const drive = google.drive({ version: 'v3', auth });

    // List spreadsheets from Google Drive
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 50
    });

    const spreadsheets = response.data.files.map(file => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime
    }));

    res.status(200).json({ success: true, spreadsheets });
  } catch (err) {
    console.error('Failed to list Google Sheets:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/google-sheets', async (req, res) => {
  const { leads, token, spreadsheetId, createNew, newSheetTitle } = req.body;

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });

    const sheets = google.sheets({ version: 'v4', auth });
    let targetSheetId = spreadsheetId;

    // If user wants to create a new sheet
    if (createNew) {
      const drive = google.drive({ version: 'v3', auth });
      const newFile = await drive.files.create({
        resource: {
          name: newSheetTitle || `LeadGen Sheet ${Date.now()}`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
        fields: 'id',
      });
      targetSheetId = newFile.data.id;

      // Add headers to the new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId: targetSheetId,
        range: 'Sheet1!A1:F1',
        valueInputOption: 'RAW',
        resource: {
          values: [['Name', 'Phone', 'Email', 'Address', 'Company', 'Website']]
        },
      });
    } else {
      // For existing sheets, check if headers exist, if not add them
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: targetSheetId,
          range: 'Sheet1!A1:F1',
        });

        if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
          // Add headers if they don't exist
          await sheets.spreadsheets.values.update({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A1:F1',
            valueInputOption: 'RAW',
            resource: {
              values: [['Name', 'Phone', 'Email', 'Address', 'Company', 'Website']]
            },
          });
        }
      } catch (headerError) {
        console.log('Could not check/add headers, continuing with data append');
      }
    }

    // Prepare the data with all lead fields
    const values = leads.map(lead => [
      lead.name || '',
      lead.phone || '',
      lead.email || '',
      lead.address || '',
      lead.company || '',
      lead.website || ''
    ]);

    // Append the data to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: targetSheetId,
      range: 'Sheet1!A:F',
      valueInputOption: 'RAW',
      resource: { values },
    });

    res.status(200).json({ success: true, sheetId: targetSheetId });
  } catch (err) {
    console.error('Export to Google Sheets failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
