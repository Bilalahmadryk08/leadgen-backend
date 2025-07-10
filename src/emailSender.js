import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'bilalahmadfvr09@gmail.com',
    pass: 'kaat wqzu dldu qcbg'
  }
});

export const sendEmail = async (from, to, subject, text, attachments = []) => {
  try {
    const mailOptions = {
      from,
      to,
      subject,
      text
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(attachment => ({
        filename: attachment.name,
        path: attachment.path
      }));
    }

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}${attachments?.length ? ` with ${attachments.length} attachment(s)` : ''}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}: ${error.message}`);
    return false;
  }
};
