import { Resend } from "resend";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const { error } = await getResend().emails.send({
    from: env.RESEND_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    logger.error({ err: error }, "email send failed");
    throw error;
  }
}

export async function sendWelcomeEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Welcome to Etash",
    html: `<p>Welcome to Etash! Your account is ready.</p>`,
  });
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your Etash email address",
    html: `
      <p>Please verify your email address to complete your Etash setup.</p>
      <p><a href="${verifyUrl}">Verify email address</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Your Etash sign-in link",
    html: `
      <p>Click the link below to sign in to Etash.</p>
      <p><a href="${magicLinkUrl}">Sign in to Etash</a></p>
      <p>This link expires in 1 hour and can only be used once.</p>
      <p>This link will open in the browser where you click it.</p>
    `,
  });
}

export async function sendPasswordChangedEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Your Etash password was changed",
    html: `
      <p>Your Etash password was changed. If you did not make this change,
      please contact support immediately.</p>
    `,
  });
}

export async function sendAccountDeletedEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Your Etash account has been deleted",
    html: `
      <p>Your Etash account and all associated data have been permanently deleted.</p>
    `,
  });
}
