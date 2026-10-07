import { STORAGE_KEY, activeBoard, buildRecap, createReview, initialState, newBoard, reviewStats, validateReview } from './model.js';
import { buildArtPrompt } from './prompt.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const defaultCover = '/assets/sprint-kitchen.jpg';
const ratingWords = ['', 'Needs a new recipe', 'Some rough edges', 'A mixed plate', 'Pretty satisfying', 'Chef’s kiss!'];
let state = loadState();
let draftRating = 0;
let creatingBoard = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.boards) && saved.boards.length && saved.boards.every(board => Array.isArray(board.reviews))) return saved;
  } catch { /* Start clean if older data is unreadable. */ }
  return initialState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function render() {
  const board = activeBoard(state);
  $('#sprint-title').textContent = board.title;
  $('#sprint-subtitle').textContent = board.description || 'A new sprint is ready for its first review.';
  $('#team-name').textContent = board.team || 'Your team';
  $('#sprint-dates').textContent = board.dates || 'Current sprint';
  $('#hero-image').src = board.cover || defaultCover;
  $('#hero-image').alt = board.cover ? `Generated cover art for ${board.title}` : 'Original playful animal characters celebrating together in a restaurant kitchen';
  $('#art-preview-image').src = board.cover || defaultCover;
  const { count, average } = reviewStats(board.reviews);
  $('#average-rating').textContent = count ? average.toFixed(1) : '—';
  $('#average-stars').textContent = count ? `${'★'.repeat(Math.round(average))}${'☆'.repeat(5 - Math.round(average))}` : '☆☆☆☆☆';
  $('#review-count').textContent = count ? `${count} review${count === 1 ? '' : 's'}` : 'No reviews yet';
  renderReviews(board);
  renderActions(board);
}

function renderReviews(board) {
  const filter = $('#filter-reviews').value;
  const reviews = [...board.reviews].reverse().filter(review => filter === 'all' || String(review.rating) === filter);
  if (!reviews.length) {
    $('#review-list').innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>${board.reviews.length ? 'No reviews at this rating yet.' : 'Be the first to review this sprint.'}</h3><p>${board.reviews.length ? 'Try another rating or show all reviews.' : 'Your take can start a useful conversation for the whole team.'}</p></div>`;
    return;
  }
  $('#review-list').innerHTML = reviews.map(review => {
    const date = new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const parts = [
      review.win ? `<div class="review-part"><strong>✦ What worked</strong><p>${escapeHtml(review.win)}</p></div>` : '',
      review.friction ? `<div class="review-part"><strong>↝ What needs work</strong><p>${escapeHtml(review.friction)}</p></div>` : '',
      review.next ? `<div class="review-part next"><strong>→ Try next sprint${review.owner ? ` · ${escapeHtml(review.owner)}` : ''}</strong><p>${escapeHtml(review.next)}</p></div>` : '',
    ].join('');
    return `<article class="review-card"><div class="review-head"><div class="review-author"><span class="avatar">${escapeHtml(review.name.charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(review.name)}</strong><small>${escapeHtml(date)}</small></span></div><div class="review-stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div></div>${review.tags.length ? `<div class="review-tags">${review.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}${parts}<div class="review-controls"><button type="button" data-helpful="${escapeHtml(review.id)}" aria-pressed="${!!review.helpful}">♥ Helpful${review.helpful ? ' · 1' : ''}</button><button type="button" data-delete="${escapeHtml(review.id)}">Remove review</button></div></article>`;
  }).join('');
}

function renderActions(board) {
  const actions = board.reviews.filter(review => review.next);
  $('#action-list').innerHTML = actions.length ? actions.map(review => `<div class="action-item ${review.done ? 'done' : ''}"><input type="checkbox" id="action-${escapeHtml(review.id)}" data-done="${escapeHtml(review.id)}" ${review.done ? 'checked' : ''} /><label for="action-${escapeHtml(review.id)}">${escapeHtml(review.next)}<small>${review.owner ? `Owner: ${escapeHtml(review.owner)}` : 'Owner to decide'}</small></label></div>`).join('') : '<div class="action-empty">Your team’s next steps will appear here after the first review.</div>';
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
  $('#form-message').textContent = 'A rating and a little detail are all you need.';
}

function resetReviewForm() {
  $('#review-form').reset();
  draftRating = 0;
  $$('#rating-stars button').forEach((button, index) => { button.classList.remove('active'); button.setAttribute('aria-checked', 'false'); button.tabIndex = index === 0 ? 0 : -1; });
  $$('#tag-options button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  $('#rating-caption').textContent = 'Select your rating';
}

function openDialog(dialog) { dialog.showModal(); }
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
  node.className = `art-message ${kind}`;
}

$('#edit-sprint').addEventListener('click', () => { fillSprintForm(); openDialog($('#sprint-dialog')); });
$$('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
$('#board-picker').addEventListener('change', event => { state.activeId = event.target.value; saveState(); resetReviewForm(); render(); fillSprintForm(); });
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
  const values = { title: $('#edit-title').value.trim(), team: $('#edit-team').value.trim(), dates: $('#edit-dates').value.trim(), description: $('#edit-description').value.trim() };
  if (!values.title) { $('#edit-title').focus(); return; }
  if (creatingBoard) { const board = newBoard({ ...values, cover: '' }); state.boards.push(board); state.activeId = board.id; resetReviewForm(); }
  else Object.assign(activeBoard(state), values);
  saveState(); render(); $('#sprint-dialog').close();
});

$$('#rating-stars button').forEach(button => {
  button.addEventListener('click', () => setRating(Number(button.dataset.rating)));
  button.addEventListener('keydown', event => {
    if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 1 : event.key === 'End' ? 5 : (draftRating || 1) + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1);
      setRating(next);
      $(`#rating-stars button[data-rating="${draftRating}"]`).focus();
    }
  });
});
$$('#tag-options button').forEach(button => button.addEventListener('click', () => button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'))));
$('#review-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = { rating: draftRating, name: $('#reviewer-name').value, tags: $$('#tag-options button[aria-pressed="true"]').map(button => button.dataset.tag), win: $('#win').value, friction: $('#friction').value, next: $('#next-step').value, owner: $('#action-owner').value };
  const error = validateReview(input);
  if (error) { $('#form-message').textContent = error; if (!draftRating) $('#rating-stars button').focus(); return; }
  activeBoard(state).reviews.push(createReview(input));
  if (!saveState()) { activeBoard(state).reviews.pop(); $('#form-message').textContent = 'This browser is out of storage space. Download a recap before posting more.'; return; }
  resetReviewForm(); render(); $('#form-message').textContent = 'Review posted!'; $('#reviews').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#filter-reviews').addEventListener('change', () => renderReviews(activeBoard(state)));
$('#review-list').addEventListener('click', event => {
  const helpful = event.target.closest('[data-helpful]');
  const remove = event.target.closest('[data-delete]');
  if (helpful) {
    const review = activeBoard(state).reviews.find(item => item.id === helpful.dataset.helpful);
    if (review) { review.helpful = !review.helpful; saveState(); renderReviews(activeBoard(state)); }
  }
  if (remove && confirm('Remove this review from this browser?')) {
    const board = activeBoard(state); board.reviews = board.reviews.filter(item => item.id !== remove.dataset.delete);
    saveState(); render();
  }
});
$('#action-list').addEventListener('change', event => {
  if (!event.target.matches('[data-done]')) return;
  const review = activeBoard(state).reviews.find(item => item.id === event.target.dataset.done);
  if (review) { review.done = event.target.checked; saveState(); renderActions(activeBoard(state)); }
});
$('#download-recap').addEventListener('click', () => {
  const board = activeBoard(state);
  const blob = new Blob([buildRecap(board)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${board.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprint'}-retro.md`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function openArtStudio() {
  const board = activeBoard(state);
  $('#art-scene').value ||= board.reviews.at(-1)?.win || board.description;
  openDialog($('#art-dialog'));
}
$('#open-art-studio').addEventListener('click', openArtStudio);
$('#open-art-studio-side').addEventListener('click', openArtStudio);
$('#copy-prompt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(buildArtPrompt(artFields())); setArtMessage('Art prompt copied. You can use it in your favorite image tool.', 'success'); }
  catch { setArtMessage('Copying is unavailable here. Try opening the app on localhost.', 'error'); }
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
  button.disabled = true; button.textContent = 'Making the cover…';
  setArtMessage('Cooking up an original scene. This may take a minute.');
  try {
    const response = await fetch('/api/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...artFields(), code: $('#art-code').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The image could not be generated.');
    const cover = await resizeCover(result.image);
    const board = activeBoard(state);
    const oldCover = board.cover;
    board.cover = cover;
    if (!saveState()) { board.cover = oldCover; throw new Error('This browser is out of space for cover art. The image was not saved.'); }
    render(); setArtMessage('Cover art saved to this sprint!', 'success');
  } catch (error) { setArtMessage(error.message, 'error'); }
  finally { button.disabled = false; button.innerHTML = 'Generate cover art <span aria-hidden="true">✦</span>'; }
});

resetReviewForm();
render();
