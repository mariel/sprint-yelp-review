import { createReview, validateReview } from '../public/model.js';
import { hasSiteAccess } from '../lib/access.js';
import { hasSharedDatabase, sharedDb } from '../lib/shared-db.js';
import { createDeleteToken, hashDeleteToken, validDeleteToken } from '../lib/review-ownership.js';

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
    if (raw.length > 1_500_000) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}

function mapReview(row) {
  return {
    id: row.id,
    rating: row.rating,
    name: row.name,
    body: row.body,
    tags: row.tags,
    next: row.next_step,
    done: row.done,
    createdAt: new Date(row.created_at).toISOString(),
    image: row.has_image ? `/api/review-image?id=${encodeURIComponent(row.id)}` : '',
  };
}

export default async function handler(req, res) {
  if (!hasSiteAccess(req)) return send(res, 401, { error: 'Enter the site password to see and post reviews.' });
  if (req.method === 'GET' && !hasSharedDatabase()) return send(res, 200, { mode: 'local', reviews: [] });
  if (!hasSharedDatabase()) return send(res, 503, { error: 'Shared reviews are not connected yet.' });

  try {
    const sql = await sharedDb();
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, rating, name, body, tags, next_step, done, created_at,
          image_base64 IS NOT NULL AS has_image
        FROM sprint_20_reviews
        ORDER BY created_at DESC, id DESC
      `;
      return send(res, 200, { mode: 'shared', reviews: rows.map(mapReview) });
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      if (typeof body.id !== 'string' || body.id.length > 100 || !validDeleteToken(body.deleteToken)) return send(res, 400, { error: 'This browser cannot delete that review.' });
      const removed = await sql`
        DELETE FROM sprint_20_reviews
        WHERE id = ${body.id} AND delete_token_hash = ${hashDeleteToken(body.deleteToken)}
        RETURNING id
      `;
      if (!removed.length) return send(res, 403, { error: 'This browser cannot delete that review.' });
      return send(res, 200, { deleted: true });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Use GET, POST, or DELETE for reviews.' });
    const body = await readBody(req);
    const input = body.review;
    if (!input || typeof input !== 'object') return send(res, 400, { error: 'Add a review before posting.' });
    if (typeof input.body !== 'string' || input.body.length > 1600 || typeof input.next !== 'string' || input.next.length > 300 || typeof input.name !== 'string' || input.name.length > 60) return send(res, 400, { error: 'Please shorten your review and try again.' });
    const error = validateReview(input);
    if (error) return send(res, 400, { error });
    const image = input.image || '';
    if (typeof image !== 'string' || image.length > 1_200_000 || (image && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image))) return send(res, 413, { error: 'The illustration is too large. Remove it and try again.' });
    const review = createReview(input);
    const sourceId = typeof body.sourceId === 'string' && body.sourceId.length <= 100 ? body.sourceId : null;
    const originalDate = body.createdAt && new Date(body.createdAt);
    const createdAt = sourceId && originalDate && Number.isFinite(originalDate.getTime()) && originalDate.getTime() <= Date.now() ? originalDate.toISOString() : review.createdAt;
    const imageBase64 = image ? image.slice('data:image/jpeg;base64,'.length) : null;
    const deleteToken = createDeleteToken();
    const inserted = await sql`
      INSERT INTO sprint_20_reviews (id, rating, name, body, tags, next_step, created_at, image_base64, source_id, delete_token_hash)
      VALUES (${review.id}, ${review.rating}, ${review.name}, ${review.body}, ${JSON.stringify(review.tags)}::jsonb, ${review.next}, ${createdAt}, ${imageBase64}, ${sourceId}, ${hashDeleteToken(deleteToken)})
      ON CONFLICT (source_id) DO NOTHING
      RETURNING id
    `;
    if (!inserted.length) {
      const existing = await sql`SELECT id FROM sprint_20_reviews WHERE source_id = ${sourceId}`;
      if (!existing.length) return send(res, 409, { error: 'That review changed while it was being imported. Please try again.' });
      return send(res, 200, { review: { id: existing[0].id }, alreadyImported: true });
    }
    return send(res, 201, { review: { ...review, createdAt, image: image ? `/api/review-image?id=${encodeURIComponent(review.id)}` : '' }, deleteToken, alreadyImported: false });
  } catch (error) {
    if (error.message === 'Request too large' || error instanceof SyntaxError) return send(res, 400, { error: 'The review request could not be read.' });
    console.error('Shared reviews failed', error.name || 'Error');
    return send(res, 503, { error: 'The shared review timeline is unavailable right now. Please try again.' });
  }
}
