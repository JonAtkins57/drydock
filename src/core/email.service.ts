import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ok, err, type Result, type AppError } from '../lib/result.js';

const ses = new SESClient({
  region: process.env.AWS_SES_REGION ?? 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL ?? 'noreply@shipyardopsai.com';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<Result<{ messageId: string }, AppError>> {
  const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

  try {
    const result = await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: toAddresses },
      Message: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: params.html, Charset: 'UTF-8' },
          ...(params.text ? { Text: { Data: params.text, Charset: 'UTF-8' } } : {}),
        },
      },
      ...(params.replyTo ? { ReplyToAddresses: [params.replyTo] } : {}),
    }));

    return ok({ messageId: result.MessageId ?? 'unknown' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return err({ code: 'INTERNAL', message: `Email send failed: ${message}` });
  }
}

export async function sendInviteEmail(
  email: string,
  tenantName: string,
  inviteToken: string,
): Promise<Result<{ messageId: string }, AppError>> {
  const inviteUrl = `https://drydock.shipyardopsai.com/invite?token=${inviteToken}`;

  return sendEmail({
    to: email,
    subject: `You've been invited to ${tenantName} on DryDock`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a3a4a; font-size: 28px; margin: 0;">DryDock</h1>
          <p style="color: #5b7b8a; font-size: 14px; letter-spacing: 2px; margin-top: 4px;">OPERATIONAL PLATFORM</p>
        </div>
        <div style="background: #f8fafb; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px;">
          <h2 style="color: #1a3a4a; font-size: 20px; margin-top: 0;">You're invited to ${tenantName}</h2>
          <p style="color: #4a5568; line-height: 1.6;">
            You've been invited to join <strong>${tenantName}</strong> on DryDock — a unified operational platform for CRM, ERP, AP, and financial close.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background: #4ecdc4; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 16px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #718096; font-size: 13px;">
            Or copy this link: <br/>
            <a href="${inviteUrl}" style="color: #4ecdc4; word-break: break-all;">${inviteUrl}</a>
          </p>
        </div>
        <p style="color: #a0aec0; font-size: 12px; text-align: center; margin-top: 30px;">
          Thrasoz / Atkins Professional Services
        </p>
      </div>
    `,
    text: `You've been invited to ${tenantName} on DryDock. Accept your invitation: ${inviteUrl}`,
  });
}
