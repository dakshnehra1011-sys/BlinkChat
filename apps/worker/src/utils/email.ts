export interface SendEmailOptions {
  to: string;
  subject: string;
  verificationToken: string;
  baseUrl: string;
}

export async function sendVerificationEmail(
  options: SendEmailOptions,
  apiKey?: string,
  emailFrom?: string
): Promise<boolean> {
  const verificationUrl = `${options.baseUrl}/verify-email?token=${options.verificationToken}`;

  // If Resend API key is provided, send real email
  if (apiKey && apiKey.trim().length > 0) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom || 'BlinkChat <no-reply@blinkchat.io>',
          to: [options.to],
          subject: options.subject,
          html: `
            <div style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 8px;">
              <h2>Welcome to BlinkChat</h2>
              <p>Please click the button below to verify your email address and unlock random matchmaking:</p>
              <a href="${verificationUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">Verify My Email</a>
              <p style="color: #94a3b8; font-size: 14px;">Or copy and paste this link: ${verificationUrl}</p>
            </div>
          `,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to send email via Resend:', err);
      return false;
    }
  }

  // Development fallback: Log verification link securely
  console.log(`\n======================================================`);
  console.log(`[EMAIL DISPATCH] Verification link for ${options.to}:`);
  console.log(`👉 ${verificationUrl}`);
  console.log(`Token: ${options.verificationToken}`);
  console.log(`======================================================\n`);
  return true;
}
