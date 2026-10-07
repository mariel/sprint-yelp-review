import { timingSafeEqual } from 'node:crypto';
import { buildArtPrompt } from '../public/prompt.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function equalSecret(received, expected) {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2500) throw new Error('Request is too large.');
  }
  return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST to generate cover art.' });
  if (!process.env.OPENAI_API_KEY || !process.env.ART_STUDIO_CODE) {
    return send(res, 503, { error: 'Live art is not connected yet. Add OPENAI_API_KEY and ART_STUDIO_CODE on the server, or copy the art prompt.' });
  }
  let body;
  try { body = await getBody(req); }
  catch { return send(res, 400, { error: 'The art request could not be read.' }); }
  if (!equalSecret(body.code, process.env.ART_STUDIO_CODE)) return send(res, 401, { error: 'That art studio code is not right.' });
  const fields = ['title', 'description', 'scene', 'cast'];
  if (fields.some(field => typeof body[field] !== 'string' || body[field].length > 500)) return send(res, 400, { error: 'Please shorten the art description and try again.' });
  const prompt = buildArtPrompt(body);
  try {
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini', prompt, size: '1536x1024', quality: 'medium', output_format: 'jpeg', n: 1 }),
      signal: AbortSignal.timeout(55000),
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      console.error('Image generation failed', upstream.status, result.error?.code || 'unknown');
      return send(res, 502, { error: 'The art studio could not make an image right now. Try again shortly.' });
    }
    const image = result.data?.[0]?.b64_json;
    if (!image) return send(res, 502, { error: 'The art studio returned no image. Try again.' });
    return send(res, 200, { image: `data:image/jpeg;base64,${image}` });
  } catch (error) {
    console.error('Image generation request failed', error.name || 'Error');
    return send(res, 504, { error: 'The art studio took too long or could not connect. Try again.' });
  }
}
