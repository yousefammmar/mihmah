// Email delivery with two providers: "dev" writes messages to a local outbox (viewable at /dev/mail
// outside production) and "smtp" sends through any SMTP provider configured in the environment.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, bodyHtml) {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#191B1E;font-family:Tahoma,Arial,sans-serif;color:#F5F5F3">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:22px;font-weight:bold;margin:0 0 20px">مهمّة</p>
<div style="background:#24272B;border-radius:16px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>${bodyHtml}</div>
<p style="color:#959BA4;font-size:12px;margin-top:20px">وصلتك هذه الرسالة لأن لديك حساباً في منصة مهمّة.</p></div></body></html>`;
}

const button = (url, label) => `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="background:#F28C54;color:#1E1410;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>
<p style="color:#B9BEC6;font-size:12px;direction:ltr;text-align:left;word-break:break-all">${escapeHtml(url)}</p>`;

export const templates = {
  verifyEmail: (url) => ({
    subject: 'أكّد بريدك الإلكتروني في مهمّة',
    text: `أهلاً بك في مهمّة. لتأكيد بريدك افتح الرابط التالي خلال 24 ساعة:\n${url}`,
    html: layout('أكّد بريدك الإلكتروني', `<p style="color:#B9BEC6">أهلاً بك في مهمّة. اضغط الزر لتأكيد بريدك خلال 24 ساعة.</p>${button(url, 'تأكيد البريد')}`),
  }),
  resetPassword: (url) => ({
    subject: 'إعادة تعيين كلمة المرور في مهمّة',
    text: `طلبت إعادة تعيين كلمة المرور. الرابط صالح لمدة ساعة واحدة:\n${url}\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.`,
    html: layout('إعادة تعيين كلمة المرور', `<p style="color:#B9BEC6">الرابط صالح لمدة ساعة واحدة. إذا لم تطلب ذلك فتجاهل هذه الرسالة وسيبقى حسابك كما هو.</p>${button(url, 'تعيين كلمة مرور جديدة')}`),
  }),
  notification: (title, url) => ({
    subject: `مهمّة: ${title}`,
    text: `${title}\n${url}`,
    html: layout(title, button(url, 'فتح في مهمّة')),
  }),
};

export function createMailer(config, log) {
  const { provider, from, devDir, smtp } = config.mail;

  if (provider === 'smtp') {
    const transport = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    return {
      provider,
      async send({ to, subject, text, html }) {
        await transport.sendMail({ from, to, subject, text, html });
        log.info('mail.sent', { provider, subject });
      },
    };
  }

  // Development outbox: one JSON file per message.
  return {
    provider,
    async send({ to, subject, text, html }) {
      await fs.mkdir(devDir, { recursive: true });
      const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      await fs.writeFile(path.join(devDir, `${id}.json`), JSON.stringify({ id, to, subject, text, html, at: new Date().toISOString() }));
      log.info('mail.dev_outbox', { subject });
    },
    async list() {
      const files = (await fs.readdir(devDir).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 50);
      return Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(devDir, f), 'utf8'))));
    },
  };
}
