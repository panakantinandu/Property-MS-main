// Quick email test script - Run with: node test-email.js
require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('\n=== Testing Email Configuration ===\n');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : 'NOT SET');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 15000
});

console.log('\n=== Verifying SMTP Connection ===\n');

transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ SMTP Connection Failed:', error.message);
    console.error('\nCommon Issues:');
    console.error('1. Check Gmail App Password is correct (not regular password)');
    console.error('2. Verify 2FA is enabled on Gmail account');
    console.error('3. Check firewall/network allows port 587');
    console.error('4. Ensure .env file is in the project root');
    process.exit(1);
  } else {
    console.log('✅ SMTP Connection Successful!\n');
    console.log('=== Sending Test Email ===\n');
    
    const testEmail = {
      from: process.env.EMAIL_FROM,
      to: process.env.SMTP_USER, // Send to yourself
      subject: 'Test Email from LeaseHub',
      text: 'This is a test email. If you receive this, your email configuration is working!',
      html: '<p>This is a test email. If you receive this, <strong>your email configuration is working!</strong></p>'
    };

    console.time('Email Send Time');
    transporter.sendMail(testEmail)
      .then(info => {
        console.timeEnd('Email Send Time');
        console.log('\n✅ Test email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('\nCheck your inbox at:', process.env.SMTP_USER);
        process.exit(0);
      })
      .catch(err => {
        console.timeEnd('Email Send Time');
        console.error('\n❌ Failed to send test email:', err.message);
        process.exit(1);
      });
  }
});

// Timeout the entire test after 30 seconds
setTimeout(() => {
  console.error('\n⏱️  Test timed out after 30 seconds');
  console.error('This usually means network connectivity issues or wrong SMTP settings');
  process.exit(1);
}, 30000);
