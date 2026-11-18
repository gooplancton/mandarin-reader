/*
 * The text library: built-in example texts (bundled) + texts the user uploaded (IndexedDB),
 * together with reading progress.
 */
import BUILT_IN from '../texts/library.js';
import * as fmt from './format.js';
import * as db from './db.js';

const builtIn = new Map(BUILT_IN.map((d) => [d.meta.id, d]));
const normalizedCache = new Map();

export function isBuiltIn(id) {
  return builtIn.has(id);
}

// Built-in texts are bundled from texts/*.json, so their relative image paths resolve against texts/.
const normalizeFor = (id, raw) => fmt.normalize(raw, builtIn.has(id) ? { base: 'texts/' } : {});

async function rawDoc(id) {
  if (builtIn.has(id)) return builtIn.get(id);
  const rec = await db.texts.get(id);
  return rec ? rec.doc : null;
}

/** Normalized document for the reader, or null if the text doesn't exist. Throws if it's invalid. */
export async function getDoc(id) {
  if (normalizedCache.has(id)) return normalizedCache.get(id);
  const raw = await rawDoc(id);
  if (!raw) return null;
  const doc = normalizeFor(id, raw);
  doc.meta.id = id; // the id it is stored under wins (uploads may have been renamed)
  normalizedCache.set(id, doc);
  return doc;
}

function summarize(id, raw, extra) {
  let words = 0;
  let chars = 0;
  let error = null;
  let meta = raw.meta || {};
  try {
    const doc = normalizeFor(id, raw);
    meta = doc.meta;
    for (const b of doc.blocks)
      for (const t of b.tokens) {
        chars += t.chars.length;
        if (!t.punct) words++;
      }
  } catch (err) {
    error = String(err.message || err);
  }
  return Object.assign({ id, meta, words, chars, error, builtIn: builtIn.has(id) }, extra);
}

/** All texts with their progress, for the library screen. */
export async function list() {
  const [uploads, progress] = await Promise.all([db.texts.all(), db.progress.all()]);
  const prog = new Map(progress.map((p) => [p.textId, p]));
  const items = [];
  for (const [id, raw] of builtIn) items.push(summarize(id, raw, { progress: prog.get(id) || null }));
  for (const rec of uploads)
    items.push(summarize(rec.id, rec.doc, { progress: prog.get(rec.id) || null, addedAt: rec.addedAt }));
  return items;
}

// ------------------------------------------------------------ books (texts sharing meta.book.id)

/** "Ch. 2 · 第二幕" — the chapter's own title, with its number if it has one. */
export function chapterLabel(meta) {
  const c = meta.chapter || {};
  const title = c.title || meta.title || '';
  const num = typeof c.number === 'number' ? `Ch. ${c.number}` : '';
  return [num, title].filter(Boolean).join(' · ');
}

/** Reading order inside a book: numbered chapters by number, then the others by title. */
export function compareChapters(a, b) {
  const ca = a.meta.chapter || {};
  const cb = b.meta.chapter || {};
  const na = typeof ca.number === 'number' ? ca.number : Infinity;
  const nb = typeof cb.number === 'number' ? cb.number : Infinity;
  if (na !== nb) return na - nb;
  const ta = ca.title || a.meta.title || '';
  const tb = cb.title || b.meta.title || '';
  return ta.localeCompare(tb, 'zh') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Book info from its chapters (sorted): each field comes from the first chapter that has it. */
function bookOf(id, chapters) {
  const pick = (k) => {
    for (const c of chapters) if (c.meta.book[k]) return c.meta.book[k];
    return undefined;
  };
  const level = (chapters.find((c) => c.meta.level) || {}).meta;
  return {
    id,
    title: pick('title') || id,
    titleTranslation: pick('titleTranslation'),
    author: pick('author'),
    level: level ? level.level : undefined,
    chapters,
  };
}

/**
 * Group library items (from list()) into books. Returns a list of entries, each either
 * { text: item } or { book: { id, title, titleTranslation, author, level, chapters } }.
 * Items that failed to load are never grouped, so they stay visible (and removable) on their own.
 */
export function group(items) {
  const books = new Map();
  const out = [];
  for (const it of items) {
    const b = !it.error && it.meta && it.meta.book;
    if (!b) {
      out.push({ text: it });
      continue;
    }
    if (!books.has(b.id)) {
      const entry = { book: null, chapters: [] };
      books.set(b.id, entry);
      out.push(entry);
    }
    books.get(b.id).chapters.push(it);
  }
  for (const [id, entry] of books) {
    entry.chapters.sort(compareChapters);
    entry.book = bookOf(id, entry.chapters);
    delete entry.chapters;
  }
  return out;
}

/** The book a text belongs to (with all its chapters, in order), or null. */
export async function bookFor(id) {
  const doc = await getDoc(id).catch(() => null);
  const bookId = doc && doc.meta.book && doc.meta.book.id;
  if (!bookId) return null;
  const entry = group(await list()).find((e) => e.book && e.book.id === bookId);
  return entry ? entry.book : null;
}

/** Validate and store an uploaded document. Returns { id, title, book, warnings }. */
export async function addUpload(raw) {
  const doc = fmt.normalize(raw); // throws on fatal problems
  let id = doc.meta.id;
  if (builtIn.has(id)) id = id + '-uploaded'; // never shadow an example text
  const stored = Object.assign({}, raw, { meta: Object.assign({}, raw.meta, { id }) });
  await db.texts.put({ id, doc: stored, addedAt: Date.now() });
  normalizedCache.delete(id);
  return { id, title: doc.meta.title, book: doc.meta.book || null, warnings: doc.warnings };
}

export async function remove(id) {
  if (builtIn.has(id)) return;
  await db.texts.delete(id);
  await db.progress.delete(id);
  normalizedCache.delete(id);
}

export async function resetProgress(id) {
  await db.progress.delete(id);
}

export async function getProgress(id) {
  return (await db.progress.get(id)) || null;
}

export async function saveProgress(id, snapshot) {
  const prev = (await db.progress.get(id)) || {};
  await db.progress.put(Object.assign(prev, snapshot, { textId: id, updatedAt: Date.now() }));
}

export async function markOpened(id) {
  const prev = (await db.progress.get(id)) || { textId: id, cursor: 0 };
  prev.openedAt = Date.now();
  await db.progress.put(prev);
}
