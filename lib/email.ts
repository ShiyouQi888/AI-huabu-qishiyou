import nodemailer from 'nodemailer'

export type VerifyCodePurpose = 'register' | 'change-email' | 'reset-password'

const COPY_BY_PURPOSE: Record<VerifyCodePurpose, { subject: string; title: string; message: string; ignore: string }> = {
  register: {
    subject: '注册验证',
    title: '验证您的邮箱',
    message: '您正在注册 AI 画布工作台账号，请使用以下验证码完成邮箱验证：',
    ignore: '如果您没有注册账号，请忽略此邮件。',
  },
  'change-email': {
    subject: '邮箱变更验证',
    title: '验证新邮箱',
    message: '您正在修改 AI 画布工作台账号的邮箱，请使用以下验证码完成验证：',
    ignore: '如果这不是您的操作，请忽略此邮件并检查账号安全。',
  },
  'reset-password': {
    subject: '密码重置验证',
    title: '重置您的密码',
    message: '您正在重置 AI 画布工作台账号密码，请使用以下验证码完成验证：',
    ignore: '如果这不是您的操作，请忽略此邮件，账号密码不会被更改。',
  },
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendVerifyCode(
  to: string,
  code: string,
  purpose: VerifyCodePurpose = 'register',
): Promise<void> {
  const copy = COPY_BY_PURPOSE[purpose]
  const from = `"AI 画布工作台" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`
  await getTransporter().sendMail({
    from,
    to,
    subject: `${code} — AI 画布工作台${copy.subject}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
        style="background:#fff;border-radius:16px;border:1px solid #e0ddd6;overflow:hidden;">
        <tr>
          <td style="background:#1a1916;padding:24px 32px;">
            <p style="margin:0;color:#f5f4f0;font-size:13px;font-weight:600;letter-spacing:0.04em;">
              AI 画布工作台
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            <h2 style="margin:0 0 8px;color:#1a1916;font-size:20px;font-weight:700;">${copy.title}</h2>
            <p style="margin:0 0 24px;color:#6e6b64;font-size:14px;line-height:1.6;">
              ${copy.message}
            </p>
            <div style="background:#f5f4f0;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
              <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#1a1916;font-variant-numeric:tabular-nums;">
                ${code}
              </span>
            </div>
            <p style="margin:0;color:#9a9690;font-size:12px;line-height:1.6;">
              验证码 <strong>5 分钟内</strong>有效，请勿泄露给他人。<br>
              ${copy.ignore}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e0ddd6;">
            <p style="margin:0;color:#b8b5ae;font-size:11px;">© 2026 AI 画布工作台</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}
