export const STORAGE_KEY = 'the-sprint-table-v1';

export function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newBoard(overrides = {}) {
  return {
    id: id(),
    title: 'Sprint 20',
    team: 'The Product Kitchen',
    dates: 'Oct 2026',
    description: 'Our pretend restaurant, reviewed by the team.',
    cover: '',
    reviews: [],
    ...overrides,
  };
}

export function initialState() {
  const board = newBoard();
  return { activeId: board.id, boards: [board] };
}

export function activeBoard(state) {
  return state.boards.find(board => board.id === state.activeId) || state.boards[0];
}

export function reviewStats(reviews) {
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0;
  return { count, average };
}

export function validateReview(input) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Choose a star rating first.';
  if (Object.hasOwn(input, 'body') && String(input.body || '').trim().length < 10) return 'Write at least 10 characters about the sprint.';
  const detail = [input.body, input.win, input.friction, input.next].filter(Boolean).join(' ').trim();
  if (detail.length < 10) return 'Add a little detail (at least 10 characters) so your team has something to discuss.';
  return '';
}

export function createReview(input) {
  const error = validateReview(input);
  if (error) throw new Error(error);
  return {
    id: id(),
    rating: Number(input.rating),
    name: String(input.name || '').trim().slice(0, 60) || 'A teammate',
    tags: Array.isArray(input.tags) ? input.tags.filter(tag => ['Teamwork', 'Scope', 'Delivery', 'Blockers', 'Team energy'].includes(tag)) : [],
    body: String(input.body || '').trim().slice(0, 1600),
    win: String(input.win || '').trim().slice(0, 1000),
    friction: String(input.friction || '').trim().slice(0, 1000),
    next: String(input.next || '').trim().slice(0, 300),
    owner: String(input.owner || '').trim().slice(0, 80),
    createdAt: new Date().toISOString(),
    helpful: false,
    done: false,
  };
}

export function buildRecap(board) {
  const { count, average } = reviewStats(board.reviews);
  const lines = [
    `# ${board.title}`,
    '',
    `${board.team}${board.dates ? ` · ${board.dates}` : ''}`,
    '',
    `Average rating: ${count ? `${average.toFixed(1)}/5 from ${count} review${count === 1 ? '' : 's'}` : 'No reviews yet'}`,
    '',
    '## Next sprint actions',
    '',
  ];
  const actions = board.reviews.filter(review => review.next);
  if (actions.length) actions.forEach(review => lines.push(`- [${review.done ? 'x' : ' '}] ${review.next}${review.owner ? ` — ${review.owner}` : ''}`));
  else lines.push('_No actions yet._');
  lines.push('', '## Reviews', '');
  if (!count) lines.push('_No reviews yet._');
  for (const review of board.reviews) {
    lines.push(`### ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} · ${review.name}`, '');
    if (review.tags.length) lines.push(`Topics: ${review.tags.join(', ')}`, '');
    if (review.body) lines.push(review.body, '');
    if (review.win) lines.push(`**What worked:** ${review.win}`, '');
    if (review.friction) lines.push(`**What needs work:** ${review.friction}`, '');
    if (review.next) lines.push(`**Try next:** ${review.next}${review.owner ? ` (owner: ${review.owner})` : ''}`, '');
  }
  return lines.join('\n');
}
