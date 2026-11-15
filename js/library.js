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
  const doc = fmt.normalize(raw);
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
    const doc = fmt.normalize(raw);
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

/** Validate and store an uploaded document. Returns { id, title, warnings }. */
export async function addUpload(raw) {
  const doc = fmt.normalize(raw); // throws on fatal problems
  let id = doc.meta.id;
  if (builtIn.has(id)) id = id + '-uploaded'; // never shadow an example text
  const stored = Object.assign({}, raw, { meta: Object.assign({}, raw.meta, { id }) });
  await db.texts.put({ id, doc: stored, addedAt: Date.now() });
  normalizedCache.delete(id);
  return { id, title: doc.meta.title, warnings: doc.warnings };
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
