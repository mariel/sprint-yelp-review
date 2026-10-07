import { sharedDb } from '../lib/shared-db.js';
import { hasSiteAccess } from '../lib/access.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
  if (!hasSiteAccess(req)) { res.statusCode = 401; return res.end('Enter the site password'); }
  const id = req.query?.id || new URL(req.url, 'http://localhost').searchParams.get('id');
  if (typeof id !== 'string' || id.length > 100) { res.statusCode = 400; return res.end('Invalid image'); }
  try {
    const sql = await sharedDb();
    if (!sql) { res.statusCode = 404; return res.end('Not found'); }
    const rows = await sql`SELECT image_base64 FROM sprint_20_reviews WHERE id = ${id} LIMIT 1`;
    if (!rows[0]?.image_base64) { res.statusCode = 404; return res.end('Not found'); }
    const bytes = Buffer.from(rows[0].image_base64, 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(bytes);
  } catch (error) {
    console.error('Shared review image failed', error.name || 'Error');
    res.statusCode = 503;
    return res.end('Image unavailable');
  }
}
