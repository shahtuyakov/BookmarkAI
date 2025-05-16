import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import * as nodemailer from 'nodemailer';
import * as aws from '@aws-sdk/client-ses';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly fromEmail: string;
  private readonly useLocalMailer: boolean;

  constructor(private readonly configService: ConfigService) {
    this.fromEmail = this.configService.get('EMAIL_FROM', 'noreply@bookmarkai.example.com');
    this.useLocalMailer = this.configService.get('USE_LOCAL_MAILER', 'true') === 'true';

    if (this.useLocalMailer) {
      // For local development, use Ethereal (fake SMTP service)
      this.createLocalTransporter();
    } else {
      // For production, use AWS SES
      this.createAwsTransporter();
    }
  }

  private async createLocalTransporter() {
    try {
      // Create test account on Ethereal
      const testAccount = await nodemailer.createTestAccount();
      
      // Create reusable transporter
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      
      this.logger.log(`Using local email transporter (Ethereal): ${testAccount.user}`);
    } catch (error) {
      this.logger.error('Failed to create local email transporter:', error);
      throw error;
    }
  }

  private createAwsTransporter() {
    try {
      // Create SES client
      const ses = new aws.SESClient({
        region: this.configService.get('AWS_REGION', 'us-east-1'),
      });
      
      // Create transporter with SES
      this.transporter = nodemailer.createTransport({
        SES: { ses, aws },
        sendingRate: 10, // Max 10 messages per second
      });
      
      this.logger.log('Using AWS SES for email transport');
    } catch (error) {
      this.logger.error('Failed to create AWS SES email transporter:', error);
      throw error;
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.fromEmail,
        to,
        subject,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML if text version not provided
        html,
      };
      
      const info = await this.transporter.sendMail(mailOptions);
      
      // For local development, log the test URL
      if (this.useLocalMailer) {
        this.logger.log(`Email preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
      
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<boolean> {
    const apiBaseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3001');
    const subject = 'Verify your BookmarkAI account';
    const verifyUrl = `${apiBaseUrl}/api/auth/verify-email?token=${token}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to BookmarkAI!</h2>
        <p>Hello ${name},</p>
        <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p>${verifyUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
        <p>Best regards,<br>The BookmarkAI Team</p>
      </div>
    `;
    
    return this.sendEmail(email, subject, html);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string, 
    token: string
  ): Promise<boolean> {
    const apiBaseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3001');
    const subject = 'Reset your BookmarkAI password';
    const resetUrl = `${apiBaseUrl}/api/auth/reset-password?token=${token}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4285F4; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        <p>Best regards,<br>The BookmarkAI Team</p>
      </div>
    `;
    
    return this.sendEmail(email, subject, html);
  }
}