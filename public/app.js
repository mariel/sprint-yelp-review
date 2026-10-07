import { STORAGE_KEY, activeBoard, buildRecap, createReview, initialState, newBoard, reviewStats, validateReview } from './model.js';
import { buildArtPrompt } from './prompt.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const defaultCover = '/assets/sprint-kitchen.jpg';
const ratingWords = ['', 'Needs a new recipe', 'Some rough edges', 'A mixed plate', 'Pretty satisfying', 'Chef’s kiss!'];
const sampleReviews = [
  {
    id: 'sample-1', sample: true, name: 'Jordan', rating: 4, createdAt: '2026-10-06T15:00:00Z',
    tags: ['Teamwork', 'Delivery'],
    body: 'The team handled the late checkout bugs really well. Pairing made the fixes feel quick and calm. I would have loved an earlier handoff to QA, but overall this was a good sprint.',
    next: 'Bring QA into the review a day before the release freeze.', owner: 'Team',
  },
  {
    id: 'sample-2', sample: true, name: 'Priya', rating: 3, createdAt: '2026-10-05T15:00:00Z',
    tags: ['Scope', 'Blockers'],
    body: 'A solid start, then the menu kept growing. The extra requests made it hard to tell which work mattered most. A smaller commitment would have given us room to finish the details.',
    next: 'Agree on one must-have list before sprint planning ends.', owner: '',
  },
  {
    id: 'sample-3', sample: true, name: 'Avery', rating: 5, createdAt: '2026-10-04T15:00:00Z',
    tags: ['Team energy'],
    body: 'Great energy around the launch. Everyone knew who to ask for help, and the daily check-ins actually cleared blockers instead of becoming status reports.',
    next: 'Keep the short blocker-focused check-ins.', owner: '',
  },
];

let state = loadState();
let draftRating = 0;
let creatingBoard = false;

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* Use a new board. */ }
  if (!saved || !Array.isArray(saved.boards) || !saved.boards.length || !saved.boards.every(board => Array.isArray(board.reviews))) return initialState();

  // Preserve the old starter board and open a fresh Sprint 20 for returning visitors.
  if (activeBoard(saved)?.title === 'Sprint 12: The Big Launch') {
    let sprint20 = saved.boards.find(board => board.title === 'Sprint 20');
    if (!sprint20) { sprint20 = newBoard(); saved.boards.push(sprint20); }
    saved.activeId = sprint20.id;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* In-memory state still works. */ }
  }
  return saved;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function setTab(name, updateHash = true) {
  const write = name === 'write';
  $('#tab-reviews').setAttribute('aria-selected', String(!write));
  $('#tab-write').setAttribute('aria-selected', String(write));
  $('#tab-reviews').tabIndex = write ? -1 : 0;
  $('#tab-write').tabIndex = write ? 0 : -1;
  $('#panel-reviews').hidden = write;
  $('#panel-write').hidden = !write;
  if (updateHash) history.replaceState(null, '', write ? '#write' : '#reviews');
}

function render() {
  const board = activeBoard(state);
  $('#sprint-title').textContent = board.title;
  $('#sprint-subtitle').textContent = board.description || 'A new sprint is ready to review.';
  $('#team-name').textContent = board.team || 'Your team';
  $('#sprint-dates').textContent = board.dates || 'Current sprint';
  $('#reviews-sprint-name').textContent = board.title;
  $('#write-sprint-name').textContent = board.title;
  $('#hero-image').src = board.cover || defaultCover;
  $('#hero-image').alt = board.cover ? `Cover art for ${board.title}` : 'Original playful animal characters celebrating in a restaurant kitchen';
  $('#art-preview-image').src = board.cover || defaultCover;
  document.title = `${board.title} reviews · The Sprint Table`;

  const { count, average } = reviewStats(board.reviews);
  $('#tab-count').textContent = String(count);
  $('#summary-line').hidden = count === 0;
  $('#download-recap').hidden = count === 0;
  $('#average-rating').textContent = count ? average.toFixed(1) : '—';
  $('#average-stars').textContent = count ? `${'★'.repeat(Math.round(average))}${'☆'.repeat(5 - Math.round(average))}` : '☆☆☆☆☆';
  $('#review-count').textContent = count ? `${count} review${count === 1 ? '' : 's'}` : 'No reviews yet';
  $('#preview-note').hidden = count > 0;
  renderReviews(board);
}

function reviewMarkup(review) {
  const date = new Date(review.createdAt);
  const dateText = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const body = review.body ? `<p class="review-body">${escapeHtml(review.body)}</p>` : [
    review.win ? `<div class="legacy-part"><strong>What worked</strong><p>${escapeHtml(review.win)}</p></div>` : '',
    review.friction ? `<div class="legacy-part"><strong>What needs work</strong><p>${escapeHtml(review.friction)}</p></div>` : '',
  ].join('');
  const tags = (review.tags || []).length ? `<div class="review-tags">${review.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : '';
  const next = review.next ? `<div class="next-note"><span class="arrow" aria-hidden="true">→</span><div><strong>Next sprint idea</strong><p>${escapeHtml(review.next)}</p>${review.owner ? `<small>Owner: ${escapeHtml(review.owner)}</small>` : ''}</div></div>` : '';
  const actions = review.sample ? '' : `<div class="review-actions">${review.next ? `<button type="button" data-done="${escapeHtml(review.id)}">${review.done ? '✓ Done' : 'Mark action done'}</button>` : ''}<button type="button" data-delete="${escapeHtml(review.id)}">Remove review</button></div>`;
  return `<div class="timeline-entry"><time class="timeline-date" datetime="${escapeHtml(review.createdAt)}">${escapeHtml(dateText)}</time><article class="review-card"><div class="review-top"><div class="review-person"><span class="avatar" aria-hidden="true">${escapeHtml(review.name.charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(review.name)}</strong><small>${review.sample ? '<span class="sample-badge">Example review</span>' : 'Team review'}</small></span></div><div class="review-stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div></div>${body}${tags}${next}${actions}</article></div>`;
}

function renderReviews(board) {
  const reviews = board.reviews.length ? [...board.reviews].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : sampleReviews;
  $('#review-list').innerHTML = reviews.map(reviewMarkup).join('');
}

function setRating(value) {
  draftRating = Math.max(1, Math.min(5, value));
  $$('#rating-stars button').forEach(button => {
    const number = Number(button.dataset.rating);
    button.classList.toggle('active', number <= draftRating);
    button.setAttribute('aria-checked', String(number === draftRating));
    button.tabIndex = number === draftRating ? 0 : -1;
  });
  $('#rating-caption').textContent = ratingWords[draftRating];
  $('#form-message').textContent = '';
}

function resetReviewForm() {
  $('#review-form').reset();
  draftRating = 0;
  $$('#rating-stars button').forEach((button, index) => {
    button.classList.remove('active');
    button.setAttribute('aria-checked', 'false');
    button.tabIndex = index === 0 ? 0 : -1;
  });
  $$('#tag-options button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  $('#rating-caption').textContent = 'Select your rating';
  $('#form-message').textContent = '';
}

function fillSprintForm() {
  const board = activeBoard(state);
  creatingBoard = false;
  $('#sprint-dialog h2').textContent = 'Edit this sprint';
  $('#sprint-form button[type="submit"]').textContent = 'Save changes';
  $('#board-picker').innerHTML = state.boards.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('');
  $('#board-picker').value = board.id;
  $('#edit-title').value = board.title;
  $('#edit-team').value = board.team;
  $('#edit-dates').value = board.dates;
  $('#edit-description').value = board.description;
}

async function resizeCover(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1200 / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .72);
}

function artFields() {
  const board = activeBoard(state);
  return { title: board.title, description: board.description, scene: $('#art-scene').value, cast: $('#art-cast').value };
}

function setArtMessage(message, kind = '') {
  const node = $('#art-message');
  node.textContent = message;
  node.className = kind;
}

$('#tab-reviews').addEventListener('click', () => setTab('reviews'));
$('#tab-write').addEventListener('click', () => setTab('write'));
$$('[role="tab"]').forEach(button => button.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'reviews' : 'write';
  setTab(next);
  $(next === 'reviews' ? '#tab-reviews' : '#tab-write').focus();
}));
window.addEventListener('hashchange', () => setTab(location.hash === '#write' ? 'write' : 'reviews', false));

$('#edit-sprint').addEventListener('click', () => { fillSprintForm(); $('#sprint-dialog').showModal(); });
$$('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
$('#board-picker').addEventListener('change', event => {
  state.activeId = event.target.value;
  saveState();
  resetReviewForm();
  render();
  fillSprintForm();
});
$('#new-sprint').addEventListener('click', () => {
  creatingBoard = true;
  $('#sprint-dialog h2').textContent = 'Start a new sprint';
  $('#sprint-form button[type="submit"]').textContent = 'Create sprint';
  $('#edit-title').value = '';
  $('#edit-team').value = activeBoard(state).team;
  $('#edit-dates').value = '';
  $('#edit-description').value = '';
  $('#edit-title').focus();
});
$('#sprint-form').addEventListener('submit', event => {
  event.preventDefault();
  const values = {
    title: $('#edit-title').value.trim(),
    team: $('#edit-team').value.trim(),
    dates: $('#edit-dates').value.trim(),
    description: $('#edit-description').value.trim(),
  };
  if (!values.title) { $('#edit-title').focus(); return; }
  if (creatingBoard) {
    const board = newBoard({ ...values, cover: '' });
    state.boards.push(board);
    state.activeId = board.id;
    resetReviewForm();
  } else Object.assign(activeBoard(state), values);
  saveState();
  render();
  $('#sprint-dialog').close();
});

$$('#rating-stars button').forEach(button => {
  button.addEventListener('click', () => setRating(Number(button.dataset.rating)));
  button.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? 5 : (draftRating || 1) + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1);
    setRating(next);
    $(`#rating-stars button[data-rating="${draftRating}"]`).focus();
  });
});
$$('#tag-options button').forEach(button => button.addEventListener('click', () => button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'))));
$('#review-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = {
    rating: draftRating,
    name: $('#reviewer-name').value,
    tags: $$('#tag-options button[aria-pressed="true"]').map(button => button.dataset.tag),
    body: $('#review-body').value,
    next: $('#next-step').value,
    owner: $('#action-owner').value,
  };
  const error = validateReview(input);
  if (error) {
    $('#form-message').textContent = error;
    if (!draftRating) $('#rating-stars button').focus();
    else $('#review-body').focus();
    return;
  }
  activeBoard(state).reviews.push(createReview(input));
  if (!saveState()) {
    activeBoard(state).reviews.pop();
    $('#form-message').textContent = 'This browser is out of storage space. Download a recap before posting more.';
    return;
  }
  resetReviewForm();
  render();
  setTab('reviews');
  $('#panel-reviews').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#review-list').addEventListener('click', event => {
  const done = event.target.closest('[data-done]');
  const remove = event.target.closest('[data-delete]');
  if (done) {
    const review = activeBoard(state).reviews.find(item => item.id === done.dataset.done);
    if (review) { review.done = !review.done; saveState(); renderReviews(activeBoard(state)); }
  }
  if (remove && confirm('Remove this review from this browser?')) {
    const board = activeBoard(state);
    board.reviews = board.reviews.filter(item => item.id !== remove.dataset.delete);
    saveState();
    render();
  }
});
$('#download-recap').addEventListener('click', () => {
  const board = activeBoard(state);
  const blob = new Blob([buildRecap(board)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${board.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprint'}-retro.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#open-art-studio').addEventListener('click', () => {
  const board = activeBoard(state);
  $('#art-scene').value ||= board.reviews.at(-1)?.body || board.reviews.at(-1)?.win || board.description;
  $('#art-dialog').showModal();
});
$('#copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildArtPrompt(artFields()));
    setArtMessage('Art prompt copied.', 'success');
  } catch { setArtMessage('Copying is unavailable here. Try opening the app on localhost.', 'error'); }
});
$('#download-cover').addEventListener('click', () => {
  const board = activeBoard(state);
  const link = document.createElement('a');
  link.href = board.cover || defaultCover;
  link.download = board.cover ? 'sprint-cover.jpg' : 'sprint-kitchen.jpg';
  link.click();
});
$('#generate-art').addEventListener('click', async () => {
  const button = $('#generate-art');
  button.disabled = true;
  button.textContent = 'Making the cover…';
  setArtMessage('Cooking up an original scene. This may take a minute.');
  try {
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...artFields(), code: $('#art-code').value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The image could not be generated.');
    const cover = await resizeCover(result.image);
    const board = activeBoard(state);
    const previous = board.cover;
    board.cover = cover;
    if (!saveState()) { board.cover = previous; throw new Error('This browser is out of space for cover art. The image was not saved.'); }
    render();
    setArtMessage('Cover art saved to this sprint!', 'success');
  } catch (error) { setArtMessage(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Generate art'; }
});

resetReviewForm();
render();
setTab(location.hash === '#write' ? 'write' : 'reviews', false);
