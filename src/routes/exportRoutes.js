import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

// Helper function to format leads to HubSpot Contacts Template structure
const formatLeadsToHubspotTemplate = (leads) => {
  return leads.map(lead => {
    // Split name into first and last name
    const nameParts = (lead.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Extract city from address or location
    let city = '';
    if (lead.address) {
      // Try to extract city from address (usually after comma)
      const addressParts = lead.address.split(',');
      city = addressParts.length > 1 ? addressParts[addressParts.length - 2].trim() : lead.address.trim();
    } else if (lead.location) {
      city = lead.location;
    }

    return {
      'First Name': firstName,
      'Last Name': lastName,
      'Email Address': lead.email || '',
      'Phone Number': lead.phone || '',
      'City': city
      // 'Lifecycle Stage': 'Lead',
      // 'Contact Owner': '',
      // 'Favorite Ice Cream Flavor': ''
    };
  });
};

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

  console.log('📥 Export request received:');
  console.log('   📊 Leads count:', leads?.length || 0);
  console.log('   🔧 Create new:', createNew);
  console.log('   📋 Sample lead:', leads?.[0]);

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ success: false, error: 'No leads provided' });
  }

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

      // Add HubSpot template headers to the new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId: targetSheetId,
        range: 'Sheet1!A1:E1',
        valueInputOption: 'RAW',
        resource: {
          values: [['First Name', 'Last Name', 'Email Address', 'Phone Number', 'City']]
        },
      });
    } else {
      // For existing sheets, check if headers exist, if not add them
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: targetSheetId,
          range: 'Sheet1!A1:E1',
        });
        if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
<<<<<<< HEAD
=======
          // Add HubSpot template headers if they don't exist
>>>>>>> 90a521c111178f7baca2eafa510477832b705cb0
          await sheets.spreadsheets.values.update({
            spreadsheetId: targetSheetId,
            range: 'Sheet1!A1:E1',
            valueInputOption: 'RAW',
            resource: {
              values: [['First Name', 'Last Name', 'Email Address', 'Phone Number', 'City']]
            },
          });
        }
      } catch (headerError) {
        console.log('Could not check/add headers, continuing with data append');
      }
    }

<<<<<<< HEAD
    // Check if leads are already formatted (from frontend) or need formatting
    let formattedLeads;

    // Check if leads are already in HubSpot format (have 'First Name' property)
    if (leads.length > 0 && leads[0]['First Name'] !== undefined) {
      console.log('✅ Leads already formatted, using as-is');
      formattedLeads = leads;
    } else {
      console.log('🔄 Raw leads detected, formatting to HubSpot template');
      // Format raw leads to HubSpot template structure
      formattedLeads = leads.map(lead => {
        // Split name into first and last name
        const nameParts = (lead.name || '').trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Extract city from address or location
        let city = '';
        if (lead.address) {
          // Try to extract city from address (usually after comma)
          const addressParts = lead.address.split(',');
          city = addressParts.length > 1 ? addressParts[addressParts.length - 2].trim() : lead.address.trim();
        } else if (lead.location) {
          city = lead.location;
        }

        return {
          'First Name': firstName,
          'Last Name': lastName,
          'Email Address': lead.email || '',
          'Phone Number': lead.phone || '',
          'City': city
          // 'Lifecycle Stage': 'Lead',
          // 'Contact Owner': '',
          // 'Favorite Ice Cream Flavor': ''
        };
      });
    }

    console.log('📊 Sample formatted lead:', formattedLeads[0]);
=======
    // Format leads to HubSpot template structure
    const formattedLeads = formatLeadsToHubspotTemplate(leads);
>>>>>>> 90a521c111178f7baca2eafa510477832b705cb0

    // Prepare the data with HubSpot template fields
    const values = formattedLeads.map(lead => [
      lead['First Name'],
      lead['Last Name'],
      lead['Email Address'],
      lead['Phone Number'],
      lead['City']
      // lead['Lifecycle Stage'],
      // lead['Contact Owner'],
      // lead['Favorite Ice Cream Flavor']
    ]);

    console.log('📋 Sample row data:', values[0]);
    console.log('📊 Total rows to export:', values.length);

    // Append the data to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: targetSheetId,
      range: 'Sheet1!A:E',
      valueInputOption: 'RAW',
      resource: { values },
    });

    res.status(200).json({ success: true, sheetId: targetSheetId });
  } catch (err) {
    console.error('Export to Google Sheets failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Route to fetch leads from a user's Google Sheet
router.post('/google-sheets/fetch', async (req, res) => {
  const { token, spreadsheetId, range } = req.body;
  if (!token || !spreadsheetId || !range) {
    return res.status(400).json({ success: false, error: 'token, spreadsheetId, and range are required' });
  }
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    console.log('📊 Google Sheets fetch debug:');
    console.log('   📋 Raw response:', response.data.values);

    // Assume first row is header
    const [header, ...rows] = response.data.values || [];

    console.log('   📝 Headers found:', header);
    console.log('   📊 Data rows count:', rows.length);
    console.log('   📋 Sample row:', rows[0]);

    // Check each column for potential emails
    if (rows.length > 0) {
      console.log('   🔍 Scanning for emails in all columns...');
      rows[0].forEach((cell, colIdx) => {
        if (cell && typeof cell === 'string' && cell.includes('@')) {
          console.log(`   📧 Potential email found in column ${colIdx + 1} (${header[colIdx] || 'Unknown'}): ${cell}`);
        }
      });
    }

    const leads = rows
      .filter(row => row && row.length > 0 && row[0] && row[0].trim()) // Filter out empty rows
      .map((row, idx) => {
        const lead = {};
        header.forEach((key, colIdx) => {
          lead[key] = row[colIdx] || '';
        });

        // ENHANCED EMAIL DETECTION - Scan ALL columns for @ symbol
        let emailFound = '';

        // Scan through ALL cells in the row to find ANY cell containing @
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cellValue = row[colIdx];
          if (cellValue && typeof cellValue === 'string' && cellValue.includes('@')) {
            // Basic email validation - must contain @ and at least one dot
            if (cellValue.includes('.') && cellValue.indexOf('@') > 0 && cellValue.indexOf('@') < cellValue.length - 1) {
              emailFound = cellValue.trim();
              console.log(`   📧 Email found in column ${colIdx + 1} (${header[colIdx] || 'Unknown'}): ${emailFound}`);
              break; // Take the first valid email found
            }
          }
        }

        // Set the email field
        lead.Email = emailFound;

        // Also try to construct a proper name from first and last name columns
        const firstName = lead[header[0]] || ''; // First column
        const lastName = lead[header[1]] || '';  // Second column (if exists)

        // If we have separate first/last names, combine them
        if (firstName && lastName && header.length > 1) {
          lead.Name = `${firstName} ${lastName}`.trim();
        } else if (firstName) {
          lead.Name = firstName;
        }

        if (idx === 0) {
          console.log('   🔍 Sample lead object:', lead);
          console.log('   📧 Email extracted:', emailFound || 'No email found');
          console.log('   👤 Name constructed:', lead.Name);
        }

        return lead;
      });

    console.log('   ✅ Total leads processed:', leads.length);

    res.status(200).json({ success: true, leads });
  } catch (err) {
    console.error('Failed to fetch leads from Google Sheet:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
