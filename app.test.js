import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, createReview, newBoard, reviewStats, validateReview } from './public/model.js';
import { buildArtPrompt } from './public/prompt.js';
import generateImage from './api/generate-image.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

test('a useful review produces a rating, action, and portable recap', () => {
  const input = { rating: 4, name: 'Alex', tags: ['Teamwork', 'Invalid tag'], win: 'Pairing on the launch made fixes much faster.', friction: 'Reviews arrived too late.', next: 'Schedule a mid-sprint review.', owner: 'Alex' };
  assert.equal(validateReview(input), '');
  const review = createReview(input);
  assert.deepEqual(review.tags, ['Teamwork']);
  const board = newBoard({ title: 'Sprint 13', reviews: [review] });
  assert.deepEqual(reviewStats(board.reviews), { count: 1, average: 4 });
  const recap = buildRecap(board);
  assert.match(recap, /Schedule a mid-sprint review\. — Alex/);
  assert.match(recap, /Average rating: 4\.0\/5 from 1 review/);
});

test('reviews require both a valid rating and something to discuss', () => {
  assert.match(validateReview({ rating: 0, win: 'A real win was teamwork.' }), /rating/);
  assert.match(validateReview({ rating: 3, win: 'Good' }), /detail/);
  assert.match(validateReview({ rating: 4, body: '', next: 'Plan earlier' }), /Write at least 10 characters/);
});

test('Sprint 20 starts with an empty real-review timeline and accepts one review body', () => {
  const board = newBoard();
  assert.equal(board.title, 'Sprint 20');
  assert.equal(board.reviews.length, 0);
  const review = createReview({ rating: 5, body: 'The team helped each other clear blockers quickly.', tags: ['Teamwork'], next: 'Keep the short check-ins.' });
  board.reviews.push(review);
  assert.equal(review.body, 'The team helped each other clear blockers quickly.');
  assert.match(buildRecap(board), /The team helped each other clear blockers quickly/);
});

test('art prompt asks for an original cast without franchise characters', () => {
  const prompt = buildArtPrompt({ title: 'Sprint 13', description: '', scene: 'Celebrating a launch', cast: 'Teal bunny' });
  assert.match(prompt, /Sprint 13/);
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

test('image endpoint checks the code and sends the art prompt server-side', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldCode = process.env.ART_STUDIO_CODE;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ART_STUDIO_CODE = 'private-code';
  const body = { title: 'Sprint 13', description: 'A launch', scene: 'Celebration', cast: 'Original teal bunny', code: 'private-code' };
  try {
    const denied = response();
    await generateImage({ method: 'POST', body: { ...body, code: 'wrong' } }, denied);
    assert.equal(denied.statusCode, 401);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/generations');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.ok(!JSON.stringify(options.body).includes('private-code'));
      assert.match(JSON.parse(options.body).prompt, /Sprint 13/);
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
