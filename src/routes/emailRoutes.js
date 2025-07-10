import express from 'express';
import multer from 'multer';
import { sendEmail } from '../emailSender.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.post('/upload', upload.single('file'), (req, res) => {
  res.json({ path: req.file.path, name: req.file.originalname });
});

router.post('/send-emails', async (req, res) => {
  try {
    const { from, leads, subject, description, attachments } = req.body;

    console.log(`📧 Email request received:`);
    console.log(`   📊 Leads count: ${leads?.length || 0}`);
    console.log(`   📎 Attachments: ${attachments?.length || 0}`, attachments);
    console.log(`   📧 From: ${from}`);
    console.log(`   📝 Subject: ${subject}`);

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: "No leads provided." });
    }

    if (!from || !subject || !description) {
      return res.status(400).json({ message: "Missing required fields: from, subject, or description." });
    }

    let emailsSent = 0;
    let emailsSkipped = 0;

    for (const lead of leads) {
    // Auto-detect email - Enhanced for Google Sheets
    const email =
      lead.email ||
      lead.Email ||
      lead.eMail ||
      lead['Email Address'] ||
      lead['email'] ||
      lead['EMAIL'] ||
      lead['E-mail'] ||
      lead['e-mail'] ||
      Object.values(lead).find(val => typeof val === 'string' && val.includes('@'));

    // Auto-detect name - Enhanced for Google Sheets (moved before email check for logging)
    const firstName = lead.firstName || lead.FirstName || lead['First Name'] || '';
    const lastName = lead.lastName || lead.LastName || lead['Last Name'] || '';
    const fullName = lead.name || lead.Name || lead['Name'] || '';

    const name = fullName || `${firstName} ${lastName}`.trim() || 'Valued Customer';

    if (!email) {
      console.warn("❌ Skipping lead with no email:", lead);
      console.warn("   📋 Available keys:", Object.keys(lead));
      console.warn("   👤 Lead name:", name);
      emailsSkipped++;
      continue;
    }

    console.log(`📧 Processing lead: ${name} <${email}>`);

    // Personalized message
    const personalizedMessage = name
      ? `Hi ${name},\n\n${description}`
      : description;

    // Send email with attachments
    const emailResult = await sendEmail(from, email, subject, personalizedMessage, attachments);
    if (emailResult) {
      emailsSent++;
    } else {
      emailsSkipped++;
    }
    await new Promise(res => setTimeout(res, 4000));
  }

  console.log(`📊 Email sending completed: ${emailsSent} sent, ${emailsSkipped} skipped`);
  res.json({
    message: 'Emails sent successfully',
    emailsSent,
    emailsSkipped,
    totalLeads: leads.length
  });

  } catch (error) {
    console.error('❌ Email sending error:', error);
    res.status(500).json({
      message: 'Failed to send emails',
      error: error.message
    });
  }
});

export default router;
