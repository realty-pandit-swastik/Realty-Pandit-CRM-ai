/**
 * OTP Email HTML Template Builder
 */

export function buildOtpEmailHtml(otp: string, purpose: string, validMinutes: number): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; text-align: center;">
    <h1 style="color: #10b981; margin: 0 0 4px; font-size: 22px;">Realty Pandit</h1>
    <p style="color: #6b7280; margin: 0 0 24px; font-size: 13px;">Your Trusted Real Estate Partner</p>
    <h2 style="color: #333; margin: 0 0 8px; font-size: 18px;">Your OTP Code</h2>
    <p style="color: #666; margin: 0 0 24px; font-size: 14px;">${purpose}</p>
    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb; padding: 16px; background: #f0f4ff; border-radius: 8px; margin-bottom: 24px;">${otp}</div>
    <p style="color: #999; font-size: 13px;">Valid for ${validMinutes} minutes. Do not share this code with anyone.</p>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
    <p style="color: #aaa; font-size: 11px;">Realty Pandit &mdash; realtypandit.in</p>
  </div>
</body>
</html>`;
}
