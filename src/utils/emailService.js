import nodemailer from 'nodemailer';

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Test email configuration on startup
export const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email service ready');
    return true;
  } catch (error) {
    console.error('Email service failed:', error.message);
    return false;
  }
};

// Send verification email
export const sendVerificationEmail = async (email, userName, token) => {
  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'News Rewards'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '✉️ Verify Your Email',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h2 { color: #333; margin-bottom: 20px; }
            .button { display: inline-block; background: #4CAF50; color: white !important; padding: 14px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .button:hover { background: #45a049; }
            .info { background: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome ${userName}! 🎉</h2>
            <p>Thank you for registering. Please verify your email to get started.</p>
            
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
            
            <div class="info">
              <strong>⏰ This link expires in 24 hours</strong>
            </div>
            
            <p>If the button doesn't work, copy this link:</p>
            <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">
              ${verificationUrl}
            </p>
            
            <div class="footer">
              <p>If you didn't create this account, please ignore this email.</p>
              <p>Having trouble? Reply to this email for support.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome ${userName}!
        
        Please verify your email by visiting: ${verificationUrl}
        
        This link expires in 24 hours.
        
        If you didn't create this account, please ignore this email.
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error.message);
    return false;
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (email, userName, token) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'News Rewards'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            .button { display: inline-block; background: #2196F3; color: white !important; padding: 14px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Password Reset Request</h2>
            <p>Hi ${userName},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <div class="warning">
              <strong>⏰ This link expires in 1 hour</strong>
            </div>
            
            <p>If you didn't request this, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send reset email:`, error.message);
    return false;
  }
};

export default transporter;