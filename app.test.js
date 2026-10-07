import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, createReview, newBoard, reviewStats, validateReview } from './public/model.js';
import { buildArtPrompt } from './public/prompt.js';
import generateImage from './api/generate-image.js';
import access from './api/access.js';
import reviews from './api/reviews.js';
import { createDeleteToken, hashDeleteToken, validDeleteToken } from './lib/review-ownership.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

test('a useful review produces a rating, action, and portable recap without an owner', () => {
  const input = { rating: 4, name: 'Alex', tags: ['Teamwork', 'Invalid tag'], win: 'Pairing on the launch made fixes much faster.', friction: 'Reviews arrived too late.', next: 'Schedule a mid-sprint review.', owner: 'Alex' };
  assert.equal(validateReview(input), '');
  const review = createReview(input);
  assert.deepEqual(review.tags, ['Teamwork']);
  const board = newBoard({ reviews: [review] });
  assert.deepEqual(reviewStats(board.reviews), { count: 1, average: 4 });
  const recap = buildRecap(board);
  assert.match(recap, /# Maison Bleu · Sprint 20/);
  assert.match(recap, /Schedule a mid-sprint review\./);
  assert.doesNotMatch(recap, /Owner|owner|— Alex/);
  assert.match(recap, /Average rating: 4\.0\/5 from 1 review/);
});

test('reviews require both a valid rating and something to discuss', () => {
  assert.match(validateReview({ rating: 0, win: 'A real win was teamwork.' }), /rating/);
  assert.match(validateReview({ rating: 3, win: 'Good' }), /detail/);
  assert.match(validateReview({ rating: 4, body: '', next: 'Plan earlier' }), /Write at least 10 characters/);
});

test('Sprint 20 starts with an empty review timeline and accepts illustrated reviews', () => {
  const board = newBoard();
  assert.equal(board.title, 'Sprint 20');
  assert.equal(board.reviews.length, 0);
  const review = createReview({ rating: 5, body: 'The team helped each other clear blockers quickly.', tags: ['Teamwork'], next: 'Keep the short check-ins.', image: 'data:image/jpeg;base64,YWJj' });
  board.reviews.push(review);
  assert.equal(review.body, 'The team helped each other clear blockers quickly.');
  assert.equal(review.image, 'data:image/jpeg;base64,YWJj');
  assert.match(buildRecap(board), /The team helped each other clear blockers quickly/);
});

test('deletion tokens are private, random, and validated before use', () => {
  const first = createDeleteToken();
  const second = createDeleteToken();
  assert.equal(validDeleteToken(first), true);
  assert.notEqual(first, second);
  assert.notEqual(hashDeleteToken(first), hashDeleteToken(second));
  assert.match(hashDeleteToken(first), /^[a-f0-9]{64}$/);
  assert.equal(validDeleteToken('team-password'), false);
});

test('art prompt asks for an original cast without franchise characters', () => {
  const prompt = buildArtPrompt({ title: 'Sprint 20', review: 'We collaborated to rescue the launch.', rating: 5, next: 'Plan QA sooner.', scene: 'Celebrating a launch', cast: 'Teal bunny' });
  assert.match(prompt, /Sprint 20/);
  assert.match(prompt, /We collaborated to rescue the launch/);
  assert.match(prompt, /entirely original/);
  assert.match(prompt, /Do not depict, imitate, or include any existing television or franchise characters/);
  assert.match(prompt, /Celebrating a launch/);
});

test('image endpoint stays unavailable until server secrets are configured', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldCode = process.env.ART_STUDIO_CODE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ART_STUDIO_CODE;
  try {
    const res = response();
    await generateImage({ method: 'POST', body: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /not connected/);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldCode === undefined) delete process.env.ART_STUDIO_CODE; else process.env.ART_STUDIO_CODE = oldCode;
  }
});

test('site password unlocks review access with a signed cookie', async () => {
  const previousCode = process.env.RETRO_ACCESS_CODE;
  const previousDatabase = process.env.DATABASE_URL;
  process.env.RETRO_ACCESS_CODE = 'test-site-password';
  delete process.env.DATABASE_URL;
  try {
    const locked = response();
    await access({ method: 'GET', headers: {} }, locked);
    assert.deepEqual(locked.body, { requiresPassword: true, unlocked: false, setupRequired: false });
    const blockedReviews = response();
    await reviews({ method: 'GET', headers: {} }, blockedReviews);
    assert.equal(blockedReviews.statusCode, 401);
    const blockedDelete = response();
    await reviews({ method: 'DELETE', headers: {}, body: { id: 'someone-elses-review', deleteToken: createDeleteToken() } }, blockedDelete);
    assert.equal(blockedDelete.statusCode, 401);
    const wrong = response();
    await access({ method: 'POST', body: { password: 'wrong' }, headers: {} }, wrong);
    assert.equal(wrong.statusCode, 401);
    const accepted = response();
    await access({ method: 'POST', body: { password: 'test-site-password' }, headers: {} }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.match(accepted.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
    const cookie = accepted.headers['Set-Cookie'].split(';')[0];
    const unlocked = response();
    await access({ method: 'GET', headers: { cookie } }, unlocked);
    assert.equal(unlocked.body.unlocked, true);
    const tampered = response();
    await access({ method: 'GET', headers: { cookie: `${cookie.slice(0, -1)}${cookie.endsWith('0') ? '1' : '0'}` } }, tampered);
    assert.equal(tampered.body.unlocked, false);
    const localFallback = response();
    await reviews({ method: 'GET', headers: { cookie } }, localFallback);
    assert.deepEqual(localFallback.body, { mode: 'local', reviews: [] });
    const noDatabasePost = response();
    await reviews({ method: 'POST', headers: { cookie }, body: {} }, noDatabasePost);
    assert.equal(noDatabasePost.statusCode, 503);
    const noDatabaseDelete = response();
    await reviews({ method: 'DELETE', headers: { cookie }, body: { id: 'test', deleteToken: createDeleteToken() } }, noDatabaseDelete);
    assert.equal(noDatabaseDelete.statusCode, 503);
    delete process.env.RETRO_ACCESS_CODE;
    process.env.DATABASE_URL = 'postgresql://example.invalid/reviews';
    const missingPassword = response();
    await access({ method: 'GET', headers: {} }, missingPassword);
    assert.deepEqual(missingPassword.body, { requiresPassword: true, unlocked: false, setupRequired: true });
    const privateByDefault = response();
    await reviews({ method: 'GET', headers: {} }, privateByDefault);
    assert.equal(privateByDefault.statusCode, 401);
  } finally {
    if (previousCode === undefined) delete process.env.RETRO_ACCESS_CODE; else process.env.RETRO_ACCESS_CODE = previousCode;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
  }
});

test('image endpoint checks the code and sends the art prompt server-side', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldCode = process.env.ART_STUDIO_CODE;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ART_STUDIO_CODE = 'private-code';
  const body = { title: 'Sprint 20', review: 'We collaborated to rescue the launch.', rating: 5, next: 'Plan QA sooner.', scene: 'Celebration', cast: 'Original teal bunny', code: 'private-code' };
  try {
    const denied = response();
    await generateImage({ method: 'POST', body: { ...body, code: 'wrong' } }, denied);
    assert.equal(denied.statusCode, 401);
    const emptyReview = response();
    await generateImage({ method: 'POST', body: { ...body, review: '' } }, emptyReview);
    assert.equal(emptyReview.statusCode, 400);
    assert.match(emptyReview.body.error, /Write your review/);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/generations');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.ok(!JSON.stringify(options.body).includes('private-code'));
      assert.match(JSON.parse(options.body).prompt, /Sprint 20/);
      return { ok: true, json: async () => ({ data: [{ b64_json: 'YWJj' }] }) };
    };
    const accepted = response();
    await generateImage({ method: 'POST', body }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.image, 'data:image/jpeg;base64,YWJj');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldCode === undefined) delete process.env.ART_STUDIO_CODE; else process.env.ART_STUDIO_CODE = oldCode;
  }
});
