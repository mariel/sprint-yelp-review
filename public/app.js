import { STORAGE_KEY, activeBoard, buildRecap, createReview, initialState, newBoard, reviewStats, validateReview } from './model.js';
import { buildArtPrompt } from './prompt.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const ratingWords = ['', 'Needs a new recipe', 'Some rough edges', 'A mixed plate', 'Pretty satisfying', 'Chef’s kiss!'];

let state = loadState();
let draftRating = 0;
let draftImage = '';

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* Use a new board. */ }
  if (!saved || !Array.isArray(saved.boards) || !saved.boards.length || !saved.boards.every(board => Array.isArray(board.reviews))) return initialState();

  // Keep existing Sprint 20 reviews while retiring sprint switching from the UI.
  let sprint20 = saved.boards.find(board => board.title === 'Sprint 20');
  if (!sprint20) { sprint20 = newBoard(); saved.boards.push(sprint20); }
  saved.activeId = sprint20.id;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* In-memory state still works. */ }
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
  document.title = `Maison Bleu · ${board.title} reviews`;

  const { count, average } = reviewStats(board.reviews);
  $('#tab-count').textContent = String(count);
  $('#summary-line').hidden = count === 0;
  $('#download-recap').hidden = count === 0;
  $('#average-rating').textContent = count ? average.toFixed(1) : '—';
  $('#average-stars').textContent = count ? `${'★'.repeat(Math.round(average))}${'☆'.repeat(5 - Math.round(average))}` : '☆☆☆☆☆';
  $('#review-count').textContent = count ? `${count} review${count === 1 ? '' : 's'}` : 'No reviews yet';
  renderReviews(board);
}

function reviewMarkup(review) {
  const date = new Date(review.createdAt);
  const dateText = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const body = review.body ? `<p class="review-body">${escapeHtml(review.body)}</p>` : [
    review.win ? `<div class="legacy-part"><strong>What worked</strong><p>${escapeHtml(review.win)}</p></div>` : '',
    review.friction ? `<div class="legacy-part"><strong>What needs work</strong><p>${escapeHtml(review.friction)}</p></div>` : '',
  ].join('');
  const illustration = typeof review.image === 'string' && review.image.startsWith('data:image/jpeg;base64,') ? `<img class="review-image" src="${escapeHtml(review.image)}" alt="Illustration generated for this review" loading="lazy" />` : '';
  const tags = (review.tags || []).length ? `<div class="review-tags">${review.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : '';
  const next = review.next ? `<div class="next-note"><span class="arrow" aria-hidden="true">→</span><div><strong>Next sprint idea</strong><p>${escapeHtml(review.next)}</p></div></div>` : '';
  const actions = `<div class="review-actions">${review.next ? `<button type="button" data-done="${escapeHtml(review.id)}">${review.done ? '✓ Done' : 'Mark action done'}</button>` : ''}<button type="button" data-delete="${escapeHtml(review.id)}">Remove review</button></div>`;
  return `<div class="timeline-entry"><time class="timeline-date" datetime="${escapeHtml(review.createdAt)}">${escapeHtml(dateText)}</time><article class="review-card"><div class="review-top"><div class="review-person"><span class="avatar" aria-hidden="true">${escapeHtml(review.name.charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(review.name)}</strong><small>Team review</small></span></div><div class="review-stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div></div>${body}${illustration}${tags}${next}${actions}</article></div>`;
}

function renderReviews(board) {
  const reviews = [...board.reviews].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('#review-list').classList.toggle('is-empty', reviews.length === 0);
  $('#review-list').innerHTML = reviews.length ? reviews.map(reviewMarkup).join('') : '<div class="empty-state"><h3>No reviews yet</h3><p>Be the first to review Sprint 20.</p><button type="button" data-go-write>Write a review</button></div>';
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
  draftImage = '';
  $('#review-art-preview').hidden = true;
  $('#art-preview-image').removeAttribute('src');
  setArtMessage('');
  $$('#rating-stars button').forEach((button, index) => {
    button.classList.remove('active');
    button.setAttribute('aria-checked', 'false');
    button.tabIndex = index === 0 ? 0 : -1;
  });
  $$('#tag-options button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  $('#rating-caption').textContent = 'Select your rating';
  $('#form-message').textContent = '';
}

async function resizeReviewImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 900 / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .7);
}

function artFields() {
  return { title: activeBoard(state).title, review: $('#review-body').value.trim(), rating: draftRating, next: $('#next-step').value.trim(), scene: $('#art-scene').value.trim(), cast: $('#art-cast').value.trim() };
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
    image: draftImage,
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
    $('#form-message').textContent = 'This browser is out of storage space. Try removing the illustration or an older review.';
    return;
  }
  resetReviewForm();
  render();
  setTab('reviews');
  $('#panel-reviews').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#review-list').addEventListener('click', event => {
  if (event.target.closest('[data-go-write]')) { setTab('write'); return; }
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

$('#copy-prompt').addEventListener('click', async () => {
  if (artFields().review.length < 10) { setArtMessage('Write your review first (at least 10 characters).', 'error'); $('#review-body').focus(); return; }
  try {
    await navigator.clipboard.writeText(buildArtPrompt(artFields()));
    setArtMessage('Image prompt copied.', 'success');
  } catch { setArtMessage('Copying is unavailable in this browser.', 'error'); }
});
$('#generate-art').addEventListener('click', async () => {
  if (artFields().review.length < 10) { setArtMessage('Write your review first (at least 10 characters).', 'error'); $('#review-body').focus(); return; }
  const button = $('#generate-art');
  button.disabled = true;
  button.textContent = 'Making your illustration…';
  setArtMessage('Cooking up a scene from your review. This may take a minute.');
  try {
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...artFields(), code: $('#art-code').value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The image could not be generated.');
    draftImage = await resizeReviewImage(result.image);
    $('#art-preview-image').src = draftImage;
    $('#review-art-preview').hidden = false;
    setArtMessage('Illustration ready. Post your review to add it to the timeline.', 'success');
  } catch (error) { setArtMessage(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Generate illustration'; }
});
$('#remove-art').addEventListener('click', () => {
  draftImage = '';
  $('#art-preview-image').removeAttribute('src');
  $('#review-art-preview').hidden = true;
  setArtMessage('Illustration removed from this review.');
});

resetReviewForm();
render();
setTab(location.hash === '#write' ? 'write' : 'reviews', false);
