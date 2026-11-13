/*
 * Mandarin Reader — segmented-text format (v1) loader.
 *
 * Turns a raw document (see docs/FORMAT.md) into a normalized structure the
 * reader can use. Unknown fields are preserved on the normalized objects so
 * that future features can read them without changing this loader.
 */
(function (global) {
  'use strict';

  const FORMAT_ID = 'mandarin-reader/segmented-text';
  const SUPPORTED_MAJOR = 1;

  const SOFT_MARK = '·'; // U+00B7: acceptable boundary inside a token
  const SENSE_MARK = '#'; // 行#2 → displays "行", dictionary key "行#2"

  // A token is punctuation if it has no letters or digits (Han counts as a letter).
  const PUNCT_RE = /^[^\p{L}\p{N}]+$/u;

  function isPunctuation(text) {
    return PUNCT_RE.test(text);
  }

  /** Parse one shorthand piece such as "不·起眼" or "行#2". */
  function parseShorthandToken(piece) {
    let key = null;
    let body = piece;
    const hash = piece.indexOf(SENSE_MARK);
    if (hash > 0) {
      body = piece.slice(0, hash);
    }
    const parts = body.split(SOFT_MARK).filter(Boolean);
    const text = parts.join('');
    if (hash > 0) key = text + piece.slice(hash);

    const tok = { w: text };
    if (key) tok.d = key;
    if (parts.length > 1) {
      tok.soft = [];
      let off = 0;
      for (let i = 0; i < parts.length - 1; i++) {
        off += [...parts[i]].length;
        tok.soft.push(off);
      }
    }
    return tok;
  }

  /** Accepts a string shorthand, an array of strings/objects, and returns raw token objects. */
  function expandTokens(tokens, where, warnings) {
    if (typeof tokens === 'string') {
      return tokens.trim().split(/\s+/).filter(Boolean).map(parseShorthandToken);
    }
    if (!Array.isArray(tokens)) {
      warnings.push(`${where}: "tokens" must be a string or an array`);
      return [];
    }
    const out = [];
    tokens.forEach((t, i) => {
      if (typeof t === 'string') {
        out.push(parseShorthandToken(t));
      } else if (t && typeof t === 'object' && typeof t.w === 'string' && t.w.length) {
        out.push(t);
      } else {
        warnings.push(`${where}, token ${i}: expected a string or an object with "w"`);
      }
    });
    return out;
  }

  /**
   * Normalize a raw document.
   * Returns { meta, dictionary, blocks, warnings } where each block is
   * { type, tokens: [{ text, chars, key, soft, punct, raw }], raw }.
   * Throws on fatal problems (wrong format, unsupported major version).
   */
  function normalize(doc) {
    if (!doc || typeof doc !== 'object') throw new Error('Document is not an object');
    if (doc.format !== FORMAT_ID) {
      throw new Error(`Unknown format "${doc.format}" (expected "${FORMAT_ID}")`);
    }
    const major = Math.floor(Number(doc.version));
    if (!(major >= 1) || major > SUPPORTED_MAJOR) {
      throw new Error(`Unsupported format version ${doc.version}; this reader supports v${SUPPORTED_MAJOR}`);
    }

    const warnings = [];
    const meta = Object.assign({ id: null, title: 'Untitled', language: 'zh-Hans' }, doc.meta || {});
    if (!meta.id) meta.id = 'text-' + hashString(JSON.stringify(doc.body || []));
    const dictionary = doc.dictionary && typeof doc.dictionary === 'object' ? doc.dictionary : {};

    if (!Array.isArray(doc.body)) throw new Error('"body" must be an array of blocks');

    const missing = new Set();
    const blocks = doc.body.map((block, bi) => {
      const where = `body[${bi}]`;
      const type = block && typeof block.type === 'string' ? block.type : 'paragraph';
      const rawTokens = expandTokens(block ? block.tokens : null, where, warnings);
      const tokens = rawTokens.map((raw) => {
        const chars = [...raw.w];
        const punct = typeof raw.punct === 'boolean' ? raw.punct : isPunctuation(raw.w);
        const key = punct ? null : raw.d || raw.w;
        const soft = Array.isArray(raw.soft)
          ? raw.soft.filter((n) => Number.isInteger(n) && n > 0 && n < chars.length)
          : [];
        if (key && !dictionary[key]) missing.add(key);
        return { text: raw.w, chars, key, soft, punct, raw };
      });
      return { type, tokens, raw: block };
    });

    if (missing.size) {
      warnings.push(`No dictionary entry for: ${[...missing].join(' ')}`);
    }
    return { meta, dictionary, blocks, warnings, raw: doc };
  }

  /** Look up a dictionary entry; normalizes "en" to an array. */
  function lookup(dictionary, key) {
    const e = key && dictionary[key];
    if (!e) return null;
    const en = Array.isArray(e.en) ? e.en : e.en ? [e.en] : [];
    return Object.assign({}, e, { en });
  }

  /*
   * Semantic weight (0..1) of a word, used to fade function words in read text.
   * Precedence: token "weight" > dictionary entry "weight" > POS default > 1.
   */
  const POS_WEIGHT = {
    n: 1, v: 1, adj: 1, idiom: 1, name: 1,
    adv: 0.6, num: 0.6, pron: 0.6, time: 0.6, conj: 0.6, aux: 0.6,
    part: 0.2, mw: 0.25, prep: 0.3, loc: 0.3, comp: 0.3,
  };

  function weightOf(dictionary, token) {
    const clamp = (x) => Math.max(0, Math.min(1, x));
    if (token.raw && typeof token.raw.weight === 'number') return clamp(token.raw.weight);
    const e = token.key && dictionary[token.key];
    if (e && typeof e.weight === 'number') return clamp(e.weight);
    if (e && e.pos in POS_WEIGHT) return POS_WEIGHT[e.pos];
    return 1;
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  global.MRFormat = { FORMAT_ID, SUPPORTED_MAJOR, POS_WEIGHT, normalize, lookup, weightOf, isPunctuation, parseShorthandToken };
})(typeof window !== 'undefined' ? window : globalThis);
