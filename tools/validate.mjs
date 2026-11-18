#!/usr/bin/env node
// Validator for Mandarin Reader segmented texts (docs/FORMAT.md). No dependencies.
//
//   node tools/validate.mjs <file.json> [--source raw.txt] [--strict] [--quiet] [--skeleton]
//
//   --source raw.txt  the tokens, joined, must equal this text (whitespace ignored):
//                     catches dropped, duplicated or altered text. Image captions count as
//                     text; a line of the form ![alt](src) marks an image and is ignored.
//   --strict          warnings count as errors
//   --quiet           print only problems and the verdict, no stats
//   --skeleton        print a JSON stub entry for every missing dictionary key (in order of
//                     first use, with "parts" from soft boundaries), to paste and fill in
//
// Exit code: 0 = no errors, 1 = errors (or warnings with --strict), 2 = bad usage / unreadable file.
//
// The validator expands tokens itself (with parseShorthandToken from js/format.js), so it
// understands block types the app's loader may not know yet ("image" with a token "caption"),
// plus meta.book / meta.chapter and the meta.source attribution convention.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

let fmt = {};
try {
  fmt = await import('../js/format.js');
} catch {
  /* fall back to local copies below */
}
const FORMAT_ID = fmt.FORMAT_ID || 'mandarin-reader/segmented-text';
const SUPPORTED_MAJOR = fmt.SUPPORTED_MAJOR || 1;
const POS_WEIGHT = fmt.POS_WEIGHT || {
  n: 1, v: 1, adj: 1, idiom: 1, name: 1,
  adv: 0.6, num: 0.6, pron: 0.6, time: 0.6, conj: 0.6, aux: 0.6,
  part: 0.2, mw: 0.25, prep: 0.3, loc: 0.3, comp: 0.3,
};
const isPunctuation = fmt.isPunctuation || ((t) => /^[^\p{L}\p{N}]+$/u.test(t));
const parseShorthandToken =
  fmt.parseShorthandToken ||
  ((piece) => {
    const hash = piece.indexOf('#');
    const body = hash > 0 ? piece.slice(0, hash) : piece;
    const parts = body.split('·').filter(Boolean);
    const tok = { w: parts.join('') };
    if (hash > 0) tok.d = tok.w + piece.slice(hash);
    if (parts.length > 1) {
      tok.soft = [];
      let off = 0;
      for (let i = 0; i < parts.length - 1; i++) tok.soft.push((off += [...parts[i]].length));
    }
    return tok;
  });

// ------------------------------------------------------------------ args
const args = process.argv.slice(2);
const opts = { strict: false, quiet: false, skeleton: false, source: null, file: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--strict') opts.strict = true;
  else if (a === '--quiet' || a === '-q') opts.quiet = true;
  else if (a === '--skeleton') opts.skeleton = true;
  else if (a === '--source') opts.source = args[++i];
  else if (a.startsWith('--source=')) opts.source = a.slice(9);
  else if (a === '-h' || a === '--help') usage(0);
  else if (!opts.file) opts.file = a;
  else usage(2);
}
if (!opts.file) usage(2);

function usage(code) {
  console.log('usage: node tools/validate.mjs <file.json> [--source raw.txt] [--strict] [--quiet] [--skeleton]');
  process.exit(code);
}

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(where ? `${where}: ${msg}` : msg);
const warn = (where, msg) => warnings.push(where ? `${where}: ${msg}` : msg);

let doc;
try {
  doc = JSON.parse(readFileSync(opts.file, 'utf8'));
} catch (e) {
  console.error(`✗ ${opts.file}: ${e.code === 'ENOENT' ? 'file not found' : 'invalid JSON — ' + e.message}`);
  process.exit(2);
}

// ------------------------------------------------------------------ helpers
const HAN = /\p{Script=Han}/u;
const HAN_G = /\p{Script=Han}/gu;
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isNonEmptyStr = (x) => typeof x === 'string' && x.trim().length > 0;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}(-\d{2}(-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?)?)?$/;
// Sentence punctuation that must never be glued to Han characters inside a token.
const HARD_PUNCT = /[，。！？、；：“”‘’「」『』（）《》〈〉【】…—,.!?;:"()\[\]~～]/u;
const POS_SET = new Set(Object.keys(POS_WEIGHT));
const short = (s, n = 40) => (s.length > n ? s.slice(0, n) + '…' : s);

// ------------------------------------------------------------------ top level
if (!isObj(doc)) {
  err('', 'document is not a JSON object');
  finish();
}
if (doc.format !== FORMAT_ID) err('format', `must be "${FORMAT_ID}", got ${JSON.stringify(doc.format)}`);
const major = Math.floor(Number(doc.version));
if (!(major >= 1)) err('version', `missing or invalid (${JSON.stringify(doc.version)})`);
else if (major > SUPPORTED_MAJOR) err('version', `${doc.version} is newer than supported v${SUPPORTED_MAJOR}`);
if (!Array.isArray(doc.body)) err('body', 'must be an array of blocks');
if (!isObj(doc.dictionary)) err('dictionary', 'must be an object');
const dict = isObj(doc.dictionary) ? doc.dictionary : {};
const body = Array.isArray(doc.body) ? doc.body : [];

// ------------------------------------------------------------------ meta
const meta = isObj(doc.meta) ? doc.meta : {};
if (!isObj(doc.meta)) err('meta', 'missing (needs at least id and title)');
if (!isNonEmptyStr(meta.id)) err('meta.id', 'missing (required for built-in texts; progress is saved under it)');
else if (!SLUG.test(meta.id)) err('meta.id', `"${meta.id}" is not a slug (lowercase a-z, 0-9, single hyphens)`);
if (!isNonEmptyStr(meta.title)) err('meta.title', 'missing');
if (meta.titleTranslation !== undefined && !isNonEmptyStr(meta.titleTranslation)) warn('meta.titleTranslation', 'empty');
if (!meta.titleTranslation) warn('meta.titleTranslation', 'missing (recommended)');
if (meta.language !== undefined && !['zh-Hans', 'zh-Hant'].includes(meta.language))
  warn('meta.language', `"${meta.language}" (expected zh-Hans or zh-Hant)`);
if (meta.level === undefined) warn('meta.level', 'missing (e.g. { "system": "HSK", "value": "4" })');
else if (!isObj(meta.level) || !isNonEmptyStr(meta.level.system) || meta.level.value === undefined)
  err('meta.level', 'must be { "system": "HSK", "value": "<level>" }');
if (meta.tags !== undefined && !(Array.isArray(meta.tags) && meta.tags.every(isNonEmptyStr)))
  warn('meta.tags', 'should be an array of strings');

if (meta.book !== undefined) {
  const b = meta.book;
  if (!isObj(b)) err('meta.book', 'must be an object { id, title, titleTranslation?, author? }');
  else {
    if (!isNonEmptyStr(b.id)) err('meta.book.id', 'missing');
    else if (!SLUG.test(b.id)) err('meta.book.id', `"${b.id}" is not a slug`);
    if (!isNonEmptyStr(b.title)) err('meta.book.title', 'missing');
    for (const k of ['titleTranslation', 'author'])
      if (b[k] !== undefined && typeof b[k] !== 'string') err(`meta.book.${k}`, 'must be a string');
    if (meta.chapter === undefined) warn('meta.book', 'set but meta.chapter is missing');
    if (isNonEmptyStr(b.id) && isNonEmptyStr(meta.id) && meta.id === b.id)
      err('meta.id', 'must differ from meta.book.id (convention: <book-id>-<n>)');
  }
}
if (meta.chapter !== undefined) {
  const c = meta.chapter;
  if (!isObj(c)) err('meta.chapter', 'must be an object { number, title? }');
  else {
    if (typeof c.number !== 'number' || !Number.isFinite(c.number)) err('meta.chapter.number', 'must be a number (sort key)');
    if (c.title !== undefined && typeof c.title !== 'string') err('meta.chapter.title', 'must be a string');
    if (meta.book === undefined) warn('meta.chapter', 'set without meta.book');
    if (isObj(meta.book) && isNonEmptyStr(meta.book.id) && isNonEmptyStr(meta.id) && typeof c.number === 'number' &&
        meta.id !== `${meta.book.id}-${c.number}`)
      warn('meta.id', `convention for chapters is "${meta.book.id}-${c.number}"`);
  }
}
if (meta.source !== undefined && isObj(meta.source)) {
  const s = meta.source;
  if (s.url !== undefined && !/^https?:\/\//.test(String(s.url))) warn('meta.source.url', 'should be an http(s) URL');
  for (const k of ['published', 'retrieved'])
    if (s[k] !== undefined && !ISO_DATE.test(String(s[k]))) warn(`meta.source.${k}`, `"${s[k]}" is not an ISO date (YYYY-MM-DD)`);
}
if (meta.license === undefined && isObj(meta.source) && meta.source.url)
  warn('meta.license', 'missing for a text with a source URL — record the license that allows using it');
else if (meta.license === undefined) warn('meta.license', 'missing (SPDX id like "CC0-1.0", "CC-BY-4.0", or "All rights reserved" for private texts)');
if (meta.licenseUrl !== undefined && !/^https?:\/\//.test(String(meta.licenseUrl))) warn('meta.licenseUrl', 'should be an http(s) URL');

// ------------------------------------------------------------------ body
/** Expand a token list (string shorthand or array) the way the loader does. */
function expand(tokens, where) {
  if (typeof tokens === 'string') {
    const pieces = tokens.trim().split(/\s+/).filter(Boolean);
    return pieces.map((p, i) => {
      const w = `${where} "${short(p, 20)}"`;
      if (p.includes('#') && p.indexOf('#') > 0 && p.indexOf('#') === p.length - 1) err(w, 'empty #sense (write the token in object form if "#" is part of the text)');
      if (p.startsWith('·') || p.endsWith('·') || p.includes('··')) err(w, 'stray soft mark "·" (a literal "·" in the text needs object form: { "w": "…" })');
      const t = parseShorthandToken(p);
      return { ...t, _src: p, _i: i };
    });
  }
  if (!Array.isArray(tokens)) {
    err(where, 'tokens must be a string or an array');
    return [];
  }
  const out = [];
  tokens.forEach((t, i) => {
    if (typeof t === 'string') {
      if (/\s/.test(t.trim())) err(`${where}[${i}]`, `array item "${short(t, 20)}" contains whitespace (one token per item)`);
      out.push({ ...parseShorthandToken(t.trim()), _src: t, _i: i });
    } else if (isObj(t) && typeof t.w === 'string' && t.w.length) {
      out.push({ ...t, _src: JSON.stringify(t), _i: i, _obj: true });
    } else err(`${where}[${i}]`, 'expected a string or an object with a non-empty "w"');
  });
  return out;
}

const usedKeys = new Map(); // key -> count
const keySoft = new Map(); // key -> Set of soft signatures seen
const missing = new Map(); // key -> first location
const missingParts = new Map(); // key -> parts derived from soft boundaries
let fullText = '';
let tokenCount = 0;
let wordCount = 0;
let paragraphs = 0;
let images = 0;

function checkTokens(tokens, where) {
  for (const t of tokens) {
    const w = t.w;
    const tw = `${where} "${short(w, 20)}"`;
    const chars = [...w];
    fullText += w;
    tokenCount++;
    const punct = typeof t.punct === 'boolean' ? t.punct : isPunctuation(w);
    if (/\s/.test(w)) {
      if (HAN.test(w)) err(tw, 'token contains whitespace');
      else if (!t._obj) err(tw, 'token contains whitespace');
      // pure Latin phrase in object form ("New York") is allowed
    }
    if (!punct && HAN.test(w) && HARD_PUNCT.test(w)) err(tw, 'punctuation glued to a word — make the punctuation its own token');
    if (punct && HAN.test(w)) err(tw, 'marked as punctuation but contains Han characters');
    if (t.soft !== undefined) {
      if (!Array.isArray(t.soft)) err(tw, '"soft" must be an array of positions');
      else {
        const bad = t.soft.filter((n) => !(Number.isInteger(n) && n > 0 && n < chars.length));
        if (bad.length) err(tw, `invalid soft position(s) ${bad.join(',')} (must be 1..${chars.length - 1})`);
        const sorted = [...t.soft].sort((a, b) => a - b);
        if (new Set(t.soft).size !== t.soft.length) warn(tw, 'duplicate soft positions');
        else if (sorted.join() !== t.soft.join()) warn(tw, 'soft positions not in ascending order');
        if (punct) warn(tw, 'soft positions on a punctuation token are ignored');
      }
    }
    if (t.weight !== undefined && !(typeof t.weight === 'number' && t.weight >= 0 && t.weight <= 1))
      err(tw, `token weight ${JSON.stringify(t.weight)} must be a number in 0..1`);
    if (t.d !== undefined && !isNonEmptyStr(t.d)) err(tw, '"d" must be a non-empty string');
    if (punct) continue;
    wordCount++;
    const key = t.d || w;
    if (t.d && t.d.includes('#') && t.d.split('#')[0] !== w) warn(tw, `key "${t.d}" does not start with the token text`);
    usedKeys.set(key, (usedKeys.get(key) || 0) + 1);
    if (!keySoft.has(key)) keySoft.set(key, new Set());
    keySoft.get(key).add((t.soft || []).join(','));
    if (!dict[key] && !missing.has(key)) missing.set(key, where);
    if (!dict[key] && t.soft && t.soft.length && !missingParts.has(key)) {
      const c = [...w];
      missingParts.set(key, [0, ...t.soft].map((s, i, a) => c.slice(s, a[i + 1]).join('')));
    }
  }
}

body.forEach((block, bi) => {
  const where = `body[${bi}]`;
  if (!isObj(block)) return err(where, 'block must be an object');
  const type = typeof block.type === 'string' ? block.type : 'paragraph';
  if (block.type === undefined) warn(where, 'no "type" (treated as paragraph)');
  if (type === 'image') {
    images++;
    checkImage(block, where);
    if (block.caption !== undefined) checkTokens(expand(block.caption, `${where}.caption`), `${where}.caption`);
    return;
  }
  if (!['paragraph', 'heading', 'dialogue', 'break'].includes(type)) warn(where, `unknown block type "${type}" (shown as a paragraph)`);
  if (type === 'break') return;
  if (type === 'paragraph' || type === 'dialogue') paragraphs++;
  const toks = expand(block.tokens, `${where}`);
  if (!toks.length) warn(where, 'empty block');
  checkTokens(toks, where);
});
if (!body.length) err('body', 'no blocks');

function checkImage(b, where) {
  const src = b.src;
  if (!isNonEmptyStr(src)) err(`${where}.src`, 'missing');
  else if (/^data:/i.test(src)) {
    if (!/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)(;[^,]*)?,/i.test(src)) err(`${where}.src`, 'data: URI must be an image (png, jpeg, gif, webp, avif, svg+xml)');
    if (src.length > 200_000) warn(`${where}.src`, `data: URI is large (${Math.round(src.length / 1024)} KB) — prefer a URL or a smaller image`);
  } else if (/^https:\/\//i.test(src)) {
    /* ok */
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(src)) err(`${where}.src`, `scheme not allowed: ${short(src)} (use https:, data: or a path relative to texts/)`);
  else if (src.startsWith('/') || src.startsWith('//') || src.split('/').includes('..'))
    err(`${where}.src`, `relative path must stay inside texts/ (no leading "/" or ".."): ${src}`);
  else warn(`${where}.src`, `relative path "${src}" only works for built-in texts (texts/${src}); uploads need https: or data:`);
  if (!isNonEmptyStr(b.alt)) err(`${where}.alt`, 'missing (alt text is required)');
  if (b.credit !== undefined && typeof b.credit !== 'string') err(`${where}.credit`, 'must be plain text');
  for (const k of ['width', 'height'])
    if (b[k] !== undefined && !(typeof b[k] === 'number' && b[k] > 0)) err(`${where}.${k}`, 'must be a positive number');
  if (b.tokens !== undefined) warn(where, 'image blocks use "caption", not "tokens"');
}

if (missing.size) {
  const list = [...missing.entries()].map(([k, w]) => `${k} (${w})`);
  err('dictionary', `no entry for ${missing.size} key(s): ${short(list.join(', '), 600)}` +
    (opts.skeleton ? '' : '  [--skeleton prints stubs]'));
}
if (opts.skeleton) {
  const lines = [...missing.keys()].map((k) => {
    const e = { py: '', pos: '', en: [''] };
    if (missingParts.has(k)) e.parts = missingParts.get(k);
    return `    ${JSON.stringify(k)}: ${JSON.stringify(e).replace(/,"/g, ', "').replace(/":/g, '": ')}`;
  });
  console.log(lines.length ? `  skeleton (${lines.length} missing entries):\n${lines.join(',\n')}` : '  skeleton: no missing entries');
}
// Built-ins: texts/<id>.json
if (/(^|[\\/])texts[\\/][^\\/]+\.json$/.test(opts.file) && isNonEmptyStr(meta.id) && basename(opts.file, '.json') !== meta.id)
  err('meta.id', `built-in text: file name must be texts/${meta.id}.json`);

// ------------------------------------------------------------------ dictionary
/** Rough syllable count of a pinyin string: one vowel group per syllable (y/w are consonants). */
const VOWELS = 'aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const VOWEL_RE = new RegExp(`[${VOWELS}]+`, 'giu');
const TONED = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]/iu;
function syllables(py) {
  return py
    .normalize('NFC')
    .split(/[\s'’\-]+/)
    .filter(Boolean)
    .reduce((n, chunk) => {
      const v = chunk.match(VOWEL_RE);
      if (v) return n + v.length;
      return n + (/^(h?[mn]g?|[ńňǹḿ]g?)$/iu.test(chunk) ? 1 : 0); // 嗯 ńg, 呣 m̀
    }, 0);
}

// House style (as in texts/xiangzi-shudian.json): 一 keeps its citation tone yī everywhere
// (一直 yīzhí, 一会儿 yīhuìr); 不 is written bú before a 4th tone inside a word (不是 búshì),
// bù otherwise; 3rd-tone sandhi is never written.
const FOURTH = /[àèìòùǜ]/u;
function checkYiBu(base, py, where) {
  const p = py.toLowerCase();
  if (base.length > 1 && base.startsWith('一') && /^y[íì]/u.test(p))
    warn(where, `"py" "${py}": write 一 with its citation tone yī (no tone-sandhi marking)`);
  if (base.length > 1 && base.startsWith('不') && /^b[ùú]/u.test(p)) {
    const next = p.slice(2).match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u);
    if (!next) return;
    if (FOURTH.test(next[0]) && p.startsWith('bù')) warn(where, `"py" "${py}": 不 before a 4th tone is written bú (不是 búshì)`);
    if (!FOURTH.test(next[0]) && p.startsWith('bú')) warn(where, `"py" "${py}": 不 is bù unless a 4th tone follows`);
  }
}

const hskCounts = {};
const normKey = (k) => k.normalize('NFKC').replace(/[·\s]/g, '').toLowerCase();
const byNorm = new Map();
// Keys named in another entry's "parts" are used too: the reader shows them as part glosses.
const partKeys = new Set(
  Object.values(dict).flatMap((e) => (isObj(e) && Array.isArray(e.parts) ? e.parts : []))
);

for (const [key, e] of Object.entries(dict)) {
  const where = `dictionary["${key}"]`;
  if (!isObj(e)) {
    err(where, 'entry must be an object');
    continue;
  }
  // duplicates / near-duplicates
  const nk = normKey(key);
  if (byNorm.has(nk)) warn(where, `looks like a duplicate of "${byNorm.get(nk)}"`);
  else byNorm.set(nk, key);
  if (/\s|·/.test(key)) warn(where, 'key contains whitespace or "·" (keys are the plain token text)');
  const hash = key.indexOf('#');
  const base = hash > 0 ? key.slice(0, hash) : key;
  if (hash > 0 && dict[base]) warn(where, `both "${base}" and "${key}" exist — once a word needs senses, give every occurrence a #sense`);
  if (!usedKeys.has(key) && !partKeys.has(key)) warn(where, 'unused (no token or "parts" list refers to it)');

  const han = (base.match(HAN_G) || []).length;
  const hasLatinOrDigit = /[\p{Script=Latin}\p{N}]/u.test(base);

  // pinyin
  if (e.py === undefined || e.py === '') {
    if (han) err(where, 'missing "py"');
  } else if (typeof e.py !== 'string') err(where, '"py" must be a string');
  else {
    const py = e.py.normalize('NFC');
    if (/[1-5](\s|$|')/.test(py) && han) err(where, `"py" uses tone numbers ("${py}") — use tone marks`);
    else if (han && /[^a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ̀-ͯ\s'’\-]/iu.test(py))
      warn(where, `"py" has unexpected characters: "${py}"`);
    if (han && !hasLatinOrDigit) {
      const n = syllables(py);
      const er = (base.match(/儿/g) || []).length;
      const ok = n === han || (er && n >= han - er && n <= han);
      if (!ok) warn(where, `"py" "${py}" has ${n} syllable(s) for ${han} character(s)`);
      checkYiBu(base, py, where);
      if (!TONED.test(py) && (n > 1 || e.pos !== 'part'))
        warn(where, `"py" "${py}" has no tone marks (only neutral-tone particles should look like that)`);
    }
  }
  // glosses
  const en = Array.isArray(e.en) ? e.en : e.en !== undefined ? [e.en] : [];
  if (!en.length || !en.every(isNonEmptyStr)) err(where, 'missing "en" gloss(es)');
  // pos / weight
  if (e.pos === undefined) warn(where, 'missing "pos"');
  else if (!POS_SET.has(e.pos)) err(where, `pos "${e.pos}" not in {${[...POS_SET].join(' ')}}`);
  if (e.weight !== undefined && !(typeof e.weight === 'number' && e.weight >= 0 && e.weight <= 1))
    err(where, `weight ${JSON.stringify(e.weight)} must be a number in 0..1`);
  // parts
  if (e.parts !== undefined) {
    if (!Array.isArray(e.parts) || !e.parts.every(isNonEmptyStr)) err(where, '"parts" must be an array of strings');
    else {
      if (e.parts.join('') !== base) err(where, `parts ${JSON.stringify(e.parts)} do not join to "${base}"`);
      if (e.parts.length < 2) warn(where, '"parts" with a single item is pointless');
      const sig = [];
      let off = 0;
      for (const p of e.parts.slice(0, -1)) sig.push((off += [...p].length));
      const seen = keySoft.get(key);
      if (seen && !seen.has(sig.join(','))) warn(where, `parts ${JSON.stringify(e.parts)} don't match the token's soft boundaries`);
    }
  } else {
    const seen = keySoft.get(key);
    if (seen && [...seen].some(Boolean)) warn(where, 'token has soft boundaries but the entry has no "parts"');
  }
  // hsk
  if (e.hsk !== undefined) {
    const h = String(e.hsk);
    if (!/^([1-9]|7-9)$/.test(h)) warn(where, `hsk "${h}" (expected "1"…"9" or "7-9")`);
    hskCounts[h] = (hskCounts[h] || 0) + 1;
  }
  if (e.notes !== undefined && typeof e.notes !== 'string') err(where, '"notes" must be a string');
}

// ------------------------------------------------------------------ --source
if (opts.source) {
  let raw;
  try {
    raw = readFileSync(opts.source, 'utf8');
  } catch (e) {
    console.error(`✗ cannot read --source ${opts.source}: ${e.message}`);
    process.exit(2);
  }
  // Lines like ![alt](src) mark where an image block goes; they are not part of the text.
  const cleaned = raw.replace(/^\s*!\[[^\]\n]*\]\([^)\n]*\)[ \t]*$/gmu, '');
  const a = [...cleaned.normalize('NFC').replace(/[\s\u{FEFF}]+/gu, '')];
  const b = [...fullText.normalize('NFC').replace(/\s+/gu, '')];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i < a.length || i < b.length) {
    const ctx = (arr) => arr.slice(Math.max(0, i - 12), i).join('') + '⟦' + arr.slice(i, i + 12).join('') + '⟧';
    err('--source', `text differs at character ${i} (of source ${a.length} / tokens ${b.length}):\n      source: …${ctx(a)}\n      tokens: …${ctx(b)}`);
  }
}

finish();

// ------------------------------------------------------------------ report
function finish() {
  const name = basename(opts.file);
  const failed = errors.length > 0 || (opts.strict && warnings.length > 0);
  for (const e of errors) console.log(`  error   ${e}`);
  for (const w of warnings) console.log(`  ${opts.strict ? 'error' : 'warning'} ${w}`);
  if (!opts.quiet && Array.isArray(doc?.body)) {
    const han = (fullText.match(HAN_G) || []).length;
    const hsk = Object.keys(hskCounts).sort().map((k) => `HSK${k}:${hskCounts[k]}`).join(' ');
    const m = isObj(doc.meta) ? doc.meta : {};
    const lvl = isObj(m.level) ? `${m.level.system} ${m.level.value}` : '?';
    const book = isObj(m.book) ? ` · book ${m.book.id} ch.${isObj(m.chapter) ? m.chapter.number : '?'}` : '';
    console.log(
      `  stats   ${han} Han chars (${[...fullText].length} incl. punct) · ${wordCount} words · ` +
        `${usedKeys.size} unique · ${Object.keys(dict).length} entries · ${paragraphs} paragraphs` +
        (images ? ` · ${images} image(s)` : '') +
        ` · level ${lvl}${book}` + (hsk ? ` · tagged ${hsk}` : '')
    );
  }
  const verdict = failed ? '✗' : '✓';
  console.log(`${verdict} ${name}: ${errors.length} error(s), ${warnings.length} warning(s)${opts.strict ? ' [strict]' : ''}`);
  process.exit(failed ? 1 : 0);
}
