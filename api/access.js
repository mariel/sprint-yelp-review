import { correctSitePassword, hasSiteAccess, requiresSitePassword, setSiteAccessCookie, siteAccessMisconfigured } from '../lib/access.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 500) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
  if (req.method === 'GET') return send(res, 200, { requiresPassword: requiresSitePassword(), unlocked: hasSiteAccess(req), setupRequired: siteAccessMisconfigured() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST for access.' });
  if (siteAccessMisconfigured()) return send(res, 503, { error: 'Set RETRO_ACCESS_CODE before opening shared reviews.' });
  let body;
  try { body = await readBody(req); }
  catch { return send(res, 400, { error: 'The password could not be read.' }); }
  if (!correctSitePassword(body.password)) return send(res, 401, { error: 'That password is not right. Try again.' });
  if (requiresSitePassword()) setSiteAccessCookie(req, res);
  return send(res, 200, { unlocked: true });
}
