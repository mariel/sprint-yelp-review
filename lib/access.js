import { createHmac, timingSafeEqual } from 'node:crypto';

const cookieName = 'maison_bleu_access';
const sessionSeconds = 7 * 24 * 60 * 60;

export function siteAccessMisconfigured() {
  return Boolean(process.env.DATABASE_URL) && !process.env.RETRO_ACCESS_CODE;
}

export function requiresSitePassword() {
  return Boolean(process.env.RETRO_ACCESS_CODE) || siteAccessMisconfigured();
}

export function correctSitePassword(received) {
  if (siteAccessMisconfigured()) return false;
  if (!requiresSitePassword()) return true;
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(process.env.RETRO_ACCESS_CODE);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(expires) {
  return createHmac('sha256', process.env.RETRO_ACCESS_CODE)
    .update(`maison-bleu-v1.${expires}`)
    .digest('hex');
}

export function hasSiteAccess(req) {
  if (siteAccessMisconfigured()) return false;
  if (!requiresSitePassword()) return true;
  const raw = String(req.headers?.cookie || '');
  const cookie = raw.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
  if (!cookie) return false;
  const value = cookie.slice(cookieName.length + 1);
  const [expiresText, receivedSignature] = value.split('.');
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || !/^[a-f0-9]{64}$/.test(receivedSignature || '')) return false;
  const a = Buffer.from(receivedSignature, 'hex');
  const b = Buffer.from(signature(expires), 'hex');
  return timingSafeEqual(a, b);
}

export function setSiteAccessCookie(req, res) {
  const expires = Date.now() + sessionSeconds * 1000;
  const secure = req.headers?.['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${expires}.${signature(expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionSeconds}${secure}`);
}
