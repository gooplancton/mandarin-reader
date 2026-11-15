/* App entry: routing between views, tab bar, drag-and-drop, offline support. */
import * as db from './db.js';
import * as flashcards from './flashcards.js';
import * as libraryView from './views/library.js';
import * as readView from './views/read.js';
import * as cardsView from './views/cards.js';
import * as reviewView from './views/review.js';
import { $, $$, toast } from './ui.js';

const views = { library: libraryView, read: readView, cards: cardsView, review: reviewView };
const tabFor = { library: 'library', read: 'read', cards: 'cards', review: 'cards' };
let active = null;

/** '#/read/some-id' → { name: 'read', arg: 'some-id' } */
function parseHash() {
  const [, name, ...rest] = (location.hash || '').split('/');
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : null;
  return { name: views[name] ? name : 'library', arg };
}

async function route() {
  const { name, arg } = parseHash();
  if (active && active !== views[name]) active.hide();
  for (const [n, v] of Object.entries(views)) v.el().hidden = n !== name;
  document.body.dataset.view = name;
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tabFor[name]));
  const prev = active;
  active = views[name];
  if (name !== 'read' && prev !== active) window.scrollTo(0, 0);
  try {
    await active.show(arg);
  } catch (err) {
    console.error(err);
    toast('Something went wrong: ' + (err.message || err));
  }
  // Keep the Read tab pointing at the open text.
  const id = readView.currentTextId() || db.prefs.get('lastText', null);
  $('.tabbar a[data-tab="read"]').href = id ? '#/read/' + encodeURIComponent(id) : '#/read';
}

async function updateBadge() {
  try {
    const s = await flashcards.summary();
    const b = $('#tab-badge');
    b.hidden = !s.toStudy;
    b.textContent = s.toStudy > 99 ? '99+' : String(s.toStudy);
  } catch (_) {}
}

// ------------------------------------------------------------ drag and drop (texts or backups)

function setupDrop() {
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    document.body.classList.add('dragging');
  });
  document.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('dragging');
  });
  document.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  document.addEventListener('drop', async (e) => {
    depth = 0;
    document.body.classList.remove('dragging');
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const id = await libraryView.importFiles([...e.dataTransfer.files]);
    if (id) location.hash = '#/library';
    updateBadge();
  });
}

// ------------------------------------------------------------ offline / install

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
  // A new version took over (it activates immediately): offer a reload rather than interrupting reading.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    toast('A new version is ready', { label: 'Reload', onClick: () => location.reload() });
  });
}

// ------------------------------------------------------------ boot

async function boot() {
  await db.migrateFromLocalStorage();
  db.requestPersistence();
  setupDrop();
  setupServiceWorker();
  flashcards.events.addEventListener('change', updateBadge);
  window.addEventListener('hashchange', route);
  window.addEventListener('focus', updateBadge);
  if (!location.hash) history.replaceState(null, '', '#/library');
  await route();
  updateBadge();
  setInterval(updateBadge, 60 * 1000); // learning cards become due within minutes
}

boot();
