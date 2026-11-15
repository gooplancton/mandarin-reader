/*
 * Flashcards: one card per word (characters + pinyin), carrying up to MAX_CONTEXTS
 * example sentences the learner saved it from.
 */
import * as db from './db.js';
import { newSrs, counts } from './srs.js';
import { todayStr } from './ui.js';

export const MAX_CONTEXTS = 5;
export const events = new EventTarget();
const changed = () => events.dispatchEvent(new Event('change'));

export function cardKey(hanzi, pinyin) {
  return hanzi + '|' + (pinyin || '').toLowerCase().replace(/\s+/g, '');
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export const all = () => db.cards.all();
export const get = (id) => db.cards.get(id);

/**
 * How a word relates to the deck: 'none' (no card), 'saved' (card exists, this sentence isn't on it),
 * or 'here' (card exists with this sentence).
 */
export async function status(hanzi, pinyin, sentence) {
  const card = await db.cards.byKey(cardKey(hanzi, pinyin));
  if (!card) return { state: 'none', card: null };
  const here = card.contexts.some((c) => c.sentence === sentence);
  return { state: here ? 'here' : 'saved', card };
}

/**
 * Add a word, or add a new context sentence to its existing card.
 * word = { hanzi, pinyin, meanings[], pos }, context = { sentence, start, length, textId, textTitle }
 */
export async function add(word, context) {
  const key = cardKey(word.hanzi, word.pinyin);
  const now = Date.now();
  let card = await db.cards.byKey(key);
  let result;
  if (!card) {
    card = {
      id: uid(),
      key,
      hanzi: word.hanzi,
      pinyin: word.pinyin || '',
      meanings: word.meanings || [],
      pos: word.pos || null,
      contexts: context ? [Object.assign({ addedAt: now }, context)] : [],
      createdAt: now,
      srs: newSrs(now),
    };
    result = 'added';
  } else if (context && !card.contexts.some((c) => c.sentence === context.sentence)) {
    card.contexts.unshift(Object.assign({ addedAt: now }, context));
    card.contexts = card.contexts.slice(0, MAX_CONTEXTS);
    result = 'context-added';
  } else {
    return { card, result: 'exists' };
  }
  await db.cards.put(card);
  changed();
  return { card, result };
}

export async function save(card) {
  await db.cards.put(card);
  changed();
}

export async function remove(id) {
  await db.cards.delete(id);
  changed();
}

export async function removeContext(card, index) {
  card.contexts.splice(index, 1);
  await save(card);
}

// --------------------------------------------------------- daily new-card allowance

export function newPerDay() {
  return db.prefs.get('newPerDay', 20);
}

export function setNewPerDay(n) {
  db.prefs.set('newPerDay', Math.max(0, Math.min(999, n | 0)));
  changed();
}

export function newAllowance() {
  const seen = db.prefs.get('newSeen', { date: '', count: 0 });
  const used = seen.date === todayStr() ? seen.count : 0;
  return Math.max(0, newPerDay() - used);
}

export function noteNewStudied() {
  const today = todayStr();
  const seen = db.prefs.get('newSeen', { date: today, count: 0 });
  db.prefs.set('newSeen', { date: today, count: (seen.date === today ? seen.count : 0) + 1 });
}

export async function summary() {
  return counts(await all(), newAllowance());
}

// --------------------------------------------------------- export

/** Tab-separated file that Anki (and most SRS apps) can import: front, pinyin, meaning, context, source. */
export function toTsv(cards) {
  const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ');
  const lines = cards.map((c) => {
    const ctx = c.contexts[0];
    let context = '';
    if (ctx) {
      const s = [...ctx.sentence];
      context =
        s.slice(0, ctx.start).join('') +
        '<b>' + s.slice(ctx.start, ctx.start + ctx.length).join('') + '</b>' +
        s.slice(ctx.start + ctx.length).join('');
    }
    return [c.hanzi, c.pinyin, c.meanings.join('; '), context, ctx ? ctx.textTitle : ''].map(clean).join('\t');
  });
  return '#separator:tab\n#html:true\n#columns:Hanzi\tPinyin\tMeaning\tContext\tSource\n' + lines.join('\n') + '\n';
}
