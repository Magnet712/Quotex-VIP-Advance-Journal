import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendNewUserNotification(user: {
  name: string;
  traderId: string;
  submittedDate: string;
}) {
  const adminEmail = process.env.GMAIL_USER;

  if (!adminEmail || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER or GMAIL_APP_PASSWORD not set. Skipping email notification.');
    return;
  }

  const subject = 'New User Submitted for Approval';
  const body = `Hello Admin,

A new user has submitted a request for activation approval on the Trading Journal website.

User Details:
Name: ${user.name}
Trader ID: ${user.traderId}
Submitted On: ${user.submittedDate}

Please review the request in the admin panel.

Thank you.`;

  try {
    await transporter.sendMail({
      from: adminEmail,
      to: adminEmail,
      subject,
      text: body,
    });
  } catch (err) {
    console.error('Failed to send new user notification email:', err);
  }
}
