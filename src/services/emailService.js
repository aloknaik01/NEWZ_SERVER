import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      pool: true, // Use pooled connections
      maxConnections: 5,
      maxMessages: 100,
    });

    // Verify connection on startup
    this.verifyConnection();
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('Email service connected successfully');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }

  async sendVerificationEmail(email, userName, token) {
    try {
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

      const mailOptions = {
        from: `"${process.env.APP_NAME || 'News Rewards'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify Your Email Address',
        html: this.getVerificationEmailTemplate(userName, verificationUrl),
        text: this.getVerificationEmailText(userName, verificationUrl),
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Verification email sent', { 
        email, 
        messageId: info.messageId 
      });
      
      return { success: true, messageId: info.messageId };

    } catch (error) {
      logger.error('Failed to send verification email:', { 
        email, 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  async sendPasswordResetEmail(email, userName, token) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

      const mailOptions = {
        from: `"${process.env.APP_NAME || 'News Rewards'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset Request',
        html: this.getPasswordResetTemplate(userName, resetUrl),
        text: this.getPasswordResetText(userName, resetUrl),
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Password reset email sent', { 
        email, 
        messageId: info.messageId 
      });
      
      return { success: true, messageId: info.messageId };

    } catch (error) {
      logger.error('Failed to send password reset email:', { 
        email, 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(email, userName) {
    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME || 'News Rewards'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to News Rewards!',
        html: this.getWelcomeEmailTemplate(userName),
        text: `Welcome ${userName}! Thank you for joining News Rewards. Start reading news and earning coins today!`,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Welcome email sent', { 
        email, 
        messageId: info.messageId 
      });
      
      return { success: true, messageId: info.messageId };

    } catch (error) {
      logger.error('Failed to send welcome email:', { 
        email, 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  getVerificationEmailTemplate(userName, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">News Rewards</h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="color: #333333; margin: 0 0 20px; font-size: 24px;">Welcome, ${userName}! </h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                      Thank you for joining News Rewards! We're excited to have you on board.
                    </p>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                      To get started, please verify your email address by clicking the button below:
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${verificationUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                            Verify Email Address
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #eeeeee;">
                      <strong>⏰ This link will expire in 24 hours.</strong>
                    </p>
                    <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 10px 0 0;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="color: #667eea; font-size: 13px; word-break: break-all; background-color: #f8f9fa; padding: 12px; border-radius: 6px; margin: 10px 0 0;">
                      ${verificationUrl}
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
                    <p style="color: #999999; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                      If you didn't create this account, please ignore this email.
                    </p>
                    <p style="color: #999999; font-size: 13px; margin: 15px 0 0; text-align: center;">
                      Need help? Contact us at <a href="mailto:support@newsrewards.com" style="color: #667eea; text-decoration: none;">support@newsrewards.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  getVerificationEmailText(userName, verificationUrl) {
    return `
Welcome to News Rewards, ${userName}!

Thank you for joining us. Please verify your email address by visiting:

${verificationUrl}

This link will expire in 24 hours.

If you didn't create this account, please ignore this email.

Need help? Contact us at support@newsrewards.com
    `.trim();
  }

  getPasswordResetTemplate(userName, resetUrl) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Password Reset</h1>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="color: #333333; margin: 0 0 20px; font-size: 24px;">Hi ${userName},</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                      We received a request to reset your password. Click the button below to set a new password:
                    </p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${resetUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color: #e74c3c; font-size: 14px; line-height: 1.6; margin: 30px 0 0; padding: 15px; background-color: #fef5f5; border-left: 4px solid #e74c3c; border-radius: 4px;">
                      <strong> Security Notice:</strong> This link will expire in 1 hour. If you didn't request this, please ignore this email and your password will remain unchanged.
                    </p>
                    
                    <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                      Link not working? Copy and paste this URL:
                    </p>
                    <p style="color: #f5576c; font-size: 13px; word-break: break-all; background-color: #f8f9fa; padding: 12px; border-radius: 6px; margin: 10px 0 0;">
                      ${resetUrl}
                    </p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
                    <p style="color: #999999; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                      For security reasons, this password reset link will expire in 1 hour.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  getPasswordResetText(userName, resetUrl) {
    return `
Hi ${userName},

We received a request to reset your password.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.

Security tip: Never share your password with anyone.
    `.trim();
  }

  getWelcomeEmailTemplate(userName) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to News Rewards</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px; text-align: center;">
                    <h1 style="color: #333333; margin: 0 0 10px; font-size: 32px;"></h1>
                    <h2 style="color: #333333; margin: 0 0 20px; font-size: 24px;">Welcome to News Rewards, ${userName}!</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                      Your email has been verified successfully. Start reading news and earning coins today!
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}

export default new EmailService();