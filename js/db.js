/*
 * Persistence: IndexedDB, all on this device.
 *
 *   texts     { id, doc, addedAt }                    uploaded texts (built-in examples are bundled, not stored)
 *   progress  { textId, cursor, stats, missed, updatedAt, openedAt }
 *   cards     { id, key, hanzi, pinyin, meanings, pos, contexts[], createdAt, srs }
 *
 * Small UI preferences stay in localStorage (see prefs below).
 */

const DB_NAME = 'mandarin-reader';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('texts')) db.createObjectStore('texts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'textId' });
      if (!db.objectStoreNames.contains('cards')) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('key', 'key', { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    Promise.resolve(fn(t.objectStore(store))).then((r) => (result = r), reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function makeStore(name) {
  return {
    get: (key) => tx(name, 'readonly', (s) => wrap(s.get(key))),
    all: () => tx(name, 'readonly', (s) => wrap(s.getAll())),
    put: (value) => tx(name, 'readwrite', (s) => wrap(s.put(value))),
    putMany: (values) => tx(name, 'readwrite', (s) => Promise.all(values.map((v) => wrap(s.put(v))))),
    delete: (key) => tx(name, 'readwrite', (s) => wrap(s.delete(key))),
    clear: () => tx(name, 'readwrite', (s) => wrap(s.clear())),
  };
}

export const texts = makeStore('texts');
export const progress = makeStore('progress');
export const cards = Object.assign(makeStore('cards'), {
  byKey: (key) => tx('cards', 'readonly', (s) => wrap(s.index('key').get(key))),
});

/** Small synchronous preferences. Never throws. */
export const prefs = {
  get(k, d) {
    try {
      const v = localStorage.getItem('mr:' + k);
      return v === null ? d : JSON.parse(v);
    } catch (_) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('mr:' + k, JSON.stringify(v));
    } catch (_) {}
  },
};

/** One-off move of data saved by the first prototype (localStorage) into IndexedDB. */
export async function migrateFromLocalStorage() {
  let ls;
  try {
    ls = window.localStorage;
    if (ls.getItem('mr:migrated') === '1') return;
  } catch (_) {
    return;
  }
  try {
    const user = JSON.parse(ls.getItem('mr:userTexts') || '{}');
    const now = Date.now();
    await texts.putMany(Object.keys(user).map((id) => ({ id, doc: user[id], addedAt: now })));
    const prog = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('mr:progress:')) {
        const snap = JSON.parse(ls.getItem(k));
        if (snap && typeof snap.cursor === 'number') prog.push(Object.assign({ textId: k.slice(12), updatedAt: now }, snap));
      }
    }
    await progress.putMany(prog);
    ls.setItem('mr:migrated', '1');
  } catch (err) {
    console.warn('Migration from localStorage failed', err);
  }
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

// ------------------------------------------------------------------ backup

export const BACKUP_FORMAT = 'mandarin-reader/backup';

export async function exportAll() {
  const [t, p, c] = await Promise.all([texts.all(), progress.all(), cards.all()]);
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), texts: t, progress: p, cards: c };
}

/** Merge a backup into the database. Existing records with the same id are replaced. */
export async function importAll(backup) {
  if (!backup || backup.format !== BACKUP_FORMAT) throw new Error('Not a Mandarin Reader backup file');
  const t = Array.isArray(backup.texts) ? backup.texts : [];
  const p = Array.isArray(backup.progress) ? backup.progress : [];
  const c = Array.isArray(backup.cards) ? backup.cards : [];
  await texts.putMany(t.filter((x) => x && x.id && x.doc));
  await progress.putMany(p.filter((x) => x && x.textId));
  // Cards: the "key" index is unique, so drop any existing card with the same key but another id.
  const existing = await cards.all();
  const byKey = new Map(existing.map((x) => [x.key, x.id]));
  for (const card of c.filter((x) => x && x.id && x.key)) {
    const other = byKey.get(card.key);
    if (other && other !== card.id) await cards.delete(other);
    await cards.put(card);
  }
  return { texts: t.length, progress: p.length, cards: c.length };
}
