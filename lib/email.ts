import nodemailer from 'nodemailer'

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

export async function sendVerifyCode(to: string, code: string): Promise<void> {
  const from = `"AI 画布工作台" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`
  await getTransporter().sendMail({
    from,
    to,
    subject: `${code} — AI 画布工作台邮箱验证`,
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
            <h2 style="margin:0 0 8px;color:#1a1916;font-size:20px;font-weight:700;">邮箱验证</h2>
            <p style="margin:0 0 24px;color:#6e6b64;font-size:14px;line-height:1.6;">
              您正在注册 AI 画布工作台账号，请使用以下验证码完成邮箱验证：
            </p>
            <div style="background:#f5f4f0;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
              <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#1a1916;font-variant-numeric:tabular-nums;">
                ${code}
              </span>
            </div>
            <p style="margin:0;color:#9a9690;font-size:12px;line-height:1.6;">
              验证码 <strong>5 分钟内</strong>有效，请勿泄露给他人。<br>
              如果您没有注册账号，请忽略此邮件。
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
