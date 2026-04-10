import { db } from '../db/connection.js';
import { emailLog } from '../db/schema/index.js';
import { sendEmail } from '../core/email.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

type EmailLogRow = typeof emailLog.$inferSelect;

export async function sendTransactionEmail(
  tenantId: string,
  entityType: string,
  entityId: string,
  toEmail: string,
  subject: string,
  html: string,
): Promise<Result<EmailLogRow, AppError>> {
  if (!toEmail) {
    return err({ code: 'NOT_FOUND', message: 'No primary contact email found for this customer' });
  }

  const sendResult = await sendEmail({ to: toEmail, subject, html });

  const status = sendResult.ok ? 'sent' : 'failed';
  const errorMsg = sendResult.ok ? null : sendResult.error.message;

  const [row] = await db
    .insert(emailLog)
    .values({
      tenantId,
      entityType,
      entityId,
      toEmail,
      subject,
      status,
      ...(errorMsg !== null ? { error: errorMsg } : {}),
    })
    .returning();

  if (!sendResult.ok) {
    return err(sendResult.error);
  }

  return ok(row!);
}
