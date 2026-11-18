/* Reader view: the segmentation game, word look-up, and adding words to flashcards. */
import Reader from '../reader.js';
import * as fmt from '../format.js';
import * as library from '../library.js';
import * as flashcards from '../flashcards.js';
import { prefs } from '../db.js';
import { $, h, toast, speak, canSpeak, buzz, contextEl, formatDuration } from '../ui.js';

let reader = null;
let currentId = null;
let nextChapterId = null;
let displayTitle = '';
let selectedTok = null;
let initialized = false;
const els = {};

export const el = () => $('#view-read');

function init() {
  if (initialized) return;
  initialized = true;
  Object.assign(els, {
    reader: $('#reader'),
    title: $('#read-title'),
    meta: $('#text-meta'),
    warnings: $('#read-warnings'),
    empty: $('#read-empty'),
    words: $('#stat-words'),
    streak: $('#stat-streak'),
    mistakes: $('#stat-mistakes'),
    accuracy: $('#stat-accuracy'),
    progress: $('#progress-bar'),
    sheet: $('#word-sheet'),
    add: $('#ws-add'),
    finish: $('#finish'),
  });

  $('#ws-close').addEventListener('click', closeSheet);
  $('#ws-speak').addEventListener('click', () => selectedTok && speak(selectedTok.text));
  els.add.addEventListener('click', addSelectedToCards);

  $('#btn-undo').addEventListener('click', () => reader && reader.undo());
  $('#btn-hint').addEventListener('click', () => reader && reader.hint());
  $('#btn-reset').addEventListener('click', () => {
    if (reader && confirm('Start this text again from the beginning?')) reader.reset();
  });
  $('#btn-font-down').addEventListener('click', () => setFont(fontSize() - 2));
  $('#btn-font-up').addEventListener('click', () => setFont(fontSize() + 2));
  setFont(fontSize());

  $('#f-review').addEventListener('click', closeFinish);
  $('#f-restart').addEventListener('click', () => {
    closeFinish();
    reader.reset();
  });
  $('#f-add-missed').addEventListener('click', addMissedToCards);

  document.addEventListener('keydown', (e) => {
    if (el().hidden) return;
    if (e.key === 'Escape') {
      closeSheet();
      closeFinish();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && reader) {
      e.preventDefault();
      reader.undo();
    }
  });
  // Tapping outside the sheet (and not on a read word) closes it.
  document.addEventListener('click', (e) => {
    if (!els.sheet.classList.contains('open')) return;
    if (els.sheet.contains(e.target) || e.target.closest('.ch.read')) return;
    closeSheet();
  });
}

const fontSize = () => prefs.get('fontSize', 28);
function setFont(px) {
  px = Math.max(18, Math.min(48, px));
  document.documentElement.style.setProperty('--fs', px + 'px');
  prefs.set('fontSize', px);
}

/** Show the view. `id` is the text to open (or the last one read). */
export async function show(id) {
  init();
  id = id || prefs.get('lastText', null);
  if (id && id === currentId && reader) {
    requestAnimationFrame(() => reader.scrollToCursor(true));
    showHeader(id, reader.doc); // chapters may have been added or removed meanwhile
    return;
  }
  closeSheet();
  closeFinish();
  if (reader) reader.destroy();
  reader = null;
  currentId = null;

  let doc = null;
  try {
    doc = id ? await library.getDoc(id) : null;
  } catch (err) {
    showWarnings([`This text can't be opened: ${err.message || err}`]);
  }
  els.empty.hidden = !!doc;
  el().classList.toggle('no-text', !doc);
  if (!doc) {
    els.title.textContent = '';
    els.meta.textContent = '';
    if (id) prefs.set('lastText', null);
    return;
  }
  showWarnings(doc.warnings);
  currentId = id;
  prefs.set('lastText', id);
  library.markOpened(id);

  await showHeader(id, doc);

  const saved = await library.getProgress(id);
  reader = new Reader(
    els.reader,
    doc,
    {
      onChange: updateStats,
      onWord: showWord,
      onFinish: showFinish,
      onFeedback: feedback,
      onSave: (snap) => library.saveProgress(id, snap),
    },
    saved
  );
  updateStats(reader);
  requestAnimationFrame(() => reader.scrollToCursor(true));
}

/** Title and meta line; for a chapter of a book: "茶馆 · 第一幕" / "Ch. 1 of 3 · Teahouse". */
async function showHeader(id, doc) {
  const m = doc.meta;
  const book = m.book ? await library.bookFor(id) : null;
  const bits = [];
  nextChapterId = null;
  if (book) {
    const chapterTitle = (m.chapter && m.chapter.title) || m.title;
    displayTitle = chapterTitle && chapterTitle !== book.title ? `${book.title} · ${chapterTitle}` : book.title;
    const n = book.chapters.length;
    const pos = book.chapters.findIndex((c) => c.id === id);
    const num = m.chapter && m.chapter.number;
    bits.push(typeof num === 'number' ? `Ch. ${num} of ${n}` : `Part ${pos + 1} of ${n}`);
    if (book.titleTranslation) bits.push(book.titleTranslation);
    if (pos >= 0 && pos + 1 < n) nextChapterId = book.chapters[pos + 1].id;
  } else {
    displayTitle = m.title;
    if (m.titleTranslation) bits.push(m.titleTranslation);
  }
  if (m.level) bits.push(`${m.level.system || ''} ${m.level.value || ''}`.trim());
  els.title.textContent = displayTitle;
  els.title.title = displayTitle;
  els.meta.textContent = bits.join(' · ');
}

export function hide() {
  closeSheet();
  closeFinish();
}

export function currentTextId() {
  return currentId;
}

function showWarnings(list) {
  els.warnings.hidden = !list.length;
  els.warnings.textContent = list.join('\n');
}

// ------------------------------------------------------------ stats & feedback

function updateStats(r) {
  const s = r.stats;
  els.words.textContent = s.words;
  els.streak.textContent = s.streak;
  els.mistakes.textContent = s.mistakes;
  const attempts = s.taps + s.mistakes;
  els.accuracy.textContent = attempts ? Math.round((100 * s.taps) / attempts) + '%' : '–';
  els.progress.style.width = (100 * r.progress).toFixed(1) + '%';
  $('#btn-undo').disabled = !r.history.length;
}

function feedback(kind, p) {
  const rect = p.el.getBoundingClientRect();
  const fx = h('div.fx.fx-' + kind, { style: { left: rect.left + rect.width / 2 + 'px', top: rect.top + 'px' } });
  if (kind === 'success') {
    fx.textContent = p.count > 0 ? `${p.praise} +${p.count}` : '✓';
    if (p.count >= 4) fx.classList.add('big');
    if (p.milestone) toast(`连对 ${p.milestone} 个词！ ${p.milestone} in a row`);
  } else {
    fx.textContent = '✗';
    buzz();
  }
  $('#fx-layer').appendChild(fx);
  setTimeout(() => fx.remove(), 1100);
}

// ------------------------------------------------------------ word sheet

function wordInfo(tok) {
  const entry = fmt.lookup(reader.doc.dictionary, tok.key);
  return {
    hanzi: tok.text,
    pinyin: entry ? entry.py || '' : '',
    meanings: entry ? entry.en : [],
    pos: entry ? entry.pos || null : null,
  };
}

function contextOf(tok) {
  return Object.assign(reader.contextFor(tok), { textId: currentId, textTitle: displayTitle || reader.doc.meta.title });
}

function showWord(r, tok) {
  if (selectedTok) selectedTok.el.classList.remove('selected');
  selectedTok = tok;
  tok.el.classList.add('selected');

  const entry = fmt.lookup(r.doc.dictionary, tok.key);
  $('#ws-hanzi').textContent = tok.text;
  $('#ws-pinyin').textContent = entry ? entry.py || '' : '';
  const defs = $('#ws-defs');
  defs.replaceChildren(...(entry ? entry.en : ['(no dictionary entry)']).map((d) => h('li', null, d)));

  const parts = entry && Array.isArray(entry.parts) ? entry.parts : [];
  const partsEl = $('#ws-parts');
  partsEl.replaceChildren();
  partsEl.hidden = !parts.length;
  if (parts.length) {
    partsEl.append('Parts: ');
    parts.forEach((p, i) => {
      if (i) partsEl.append(' + ');
      const sub = fmt.lookup(r.doc.dictionary, p);
      partsEl.append(h('span.part', { title: sub ? `${sub.py} — ${sub.en.join('; ')}` : null }, p));
    });
  }
  const notes = $('#ws-notes');
  notes.textContent = entry && entry.notes ? entry.notes : '';
  notes.hidden = !notes.textContent;
  const tag = $('#ws-tag');
  tag.textContent = entry && entry.hsk ? 'HSK ' + entry.hsk : '';
  tag.hidden = !tag.textContent;
  $('#ws-speak').hidden = !canSpeak;

  const ctx = contextOf(tok);
  $('#ws-context').replaceChildren(contextEl(ctx));
  refreshAddButton(tok, ctx);

  els.sheet.classList.add('open');
  els.sheet.setAttribute('aria-hidden', 'false');
}

async function refreshAddButton(tok, ctx) {
  const info = wordInfo(tok);
  els.add.disabled = true;
  const { state } = await flashcards.status(info.hanzi, info.pinyin, ctx.sentence);
  if (selectedTok !== tok) return;
  els.add.disabled = state === 'here';
  els.add.classList.toggle('primary', state !== 'here');
  els.add.textContent =
    state === 'none' ? '＋ Add to cards' : state === 'saved' ? '＋ Add this sentence to its card' : '✓ In your cards';
}

async function addSelectedToCards() {
  const tok = selectedTok;
  if (!tok) return;
  const ctx = contextOf(tok);
  const { result } = await flashcards.add(wordInfo(tok), ctx);
  toast(result === 'added' ? `Added ${tok.text} to your cards` : `Saved another sentence for ${tok.text}`);
  refreshAddButton(tok, ctx);
}

function closeSheet() {
  if (!els.sheet) return;
  els.sheet.classList.remove('open');
  els.sheet.setAttribute('aria-hidden', 'true');
  if (selectedTok) selectedTok.el.classList.remove('selected');
  selectedTok = null;
}

// ------------------------------------------------------------ finish

function showFinish(r) {
  const s = r.stats;
  const ms = (s.finishedAt || Date.now()) - (s.startedAt || Date.now());
  const minutes = Math.max(ms / 60000, 1 / 60);
  const attempts = s.taps + s.mistakes;
  const set = (id, v) => ($(id).textContent = v);
  set('#f-words', r.wordCount);
  set('#f-mistakes', s.mistakes);
  set('#f-accuracy', attempts ? Math.round((100 * s.taps) / attempts) + '%' : '–');
  set('#f-chunk', s.taps ? (s.words / s.taps).toFixed(1) : '–');
  set('#f-best', s.bestStreak);
  set('#f-time', formatDuration(ms));
  set('#f-speed', Math.round(r.chars.length / minutes));

  const missed = r.missedTokens();
  $('#f-missed-wrap').hidden = !missed.length;
  $('#f-missed').replaceChildren(
    ...missed.map((t) => {
      const e = fmt.lookup(r.doc.dictionary, t.key);
      return h('li', null, h('span.h', null, t.text), ' ', h('span.py', null, e ? e.py : ''), ' ', h('span.en', null, e ? e.en.join('; ') : ''));
    })
  );
  const nextBtn = $('#f-next');
  nextBtn.hidden = !nextChapterId;
  if (nextChapterId) nextBtn.href = '#/read/' + encodeURIComponent(nextChapterId);
  $('#f-restart').classList.toggle('primary', !nextChapterId);

  const btn = $('#f-add-missed');
  btn.disabled = false;
  btn.textContent = '＋ Add these to cards';
  setTimeout(() => els.finish.classList.add('open'), 500);
}

async function addMissedToCards() {
  const btn = $('#f-add-missed');
  btn.disabled = true;
  let n = 0;
  for (const t of reader.missedTokens()) {
    const { result } = await flashcards.add(wordInfo(t), contextOf(t));
    if (result !== 'exists') n++;
  }
  btn.textContent = n ? `✓ Added ${n}` : '✓ Already in your cards';
}

function closeFinish() {
  if (els.finish) els.finish.classList.remove('open');
}
