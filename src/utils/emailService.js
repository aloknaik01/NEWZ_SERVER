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

// ✅ NEW: Send 6-digit OTP email (sendVerificationOTP)
export const sendVerificationOTP = async (email, userName, otp) => {
  try {
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'NewsApp'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 Your Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              margin: 0;
              padding: 40px 20px;
            }
            .container { 
              max-width: 600px;
              margin: 0 auto;
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .header {
              background: linear-gradient(135deg, #FF4B2B 0%, #FF416C 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .header p {
              color: rgba(255,255,255,0.9);
              margin: 10px 0 0;
              font-size: 16px;
            }
            .content {
              padding: 40px 30px;
              text-align: center;
            }
            .greeting {
              font-size: 20px;
              color: #333;
              margin-bottom: 20px;
              font-weight: 600;
            }
            .message {
              font-size: 16px;
              color: #666;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .otp-container {
              background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
              border-radius: 12px;
              padding: 30px;
              margin: 30px 0;
              border: 2px dashed #FF4B2B;
            }
            .otp-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-weight: 600;
            }
            .otp-code {
              font-size: 48px;
              font-weight: 700;
              color: #FF4B2B;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
              margin: 10px 0;
            }
            .timer {
              background: #fff3cd;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #ffc107;
            }
            .timer-text {
              color: #856404;
              font-size: 14px;
              font-weight: 600;
              margin: 0;
            }
            .footer {
              background: #f8f9fa;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #dee2e6;
            }
            .footer p {
              color: #6c757d;
              font-size: 14px;
              margin: 5px 0;
            }
            .security-note {
              background: #d1ecf1;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #0c5460;
            }
            .security-text {
              color: #0c5460;
              font-size: 14px;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
          
        
            <div class="content">
              
        
              <div class="otp-container">
                <p class="otp-label">Your Verification Code</p>
                <div class="otp-code">${otp}</div>
              </div>
              
              <div class="timer">
                <p class="timer-text">⏰ This code expires in 10 minutes</p>
              </div>
              
              <div class="security-note">
               
              </div>
            </div>
            
           
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${userName}!
        
        Your verification code is: ${otp}
        
        This code expires in 10 minutes.
        
        If you didn't create this account, please ignore this email.
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP sent to: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send OTP to ${email}:`, error.message);
    return false;
  }
};

// ✅ KEEP OLD FUNCTION FOR BACKWARD COMPATIBILITY
export const sendVerificationEmail = sendVerificationOTP; // Alias for old imports

// Send password reset email
export const sendPasswordResetEmail = async (email, userName, token) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'NewsApp'}" <${process.env.EMAIL_USER}>`,
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