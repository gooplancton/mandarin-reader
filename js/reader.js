/*
 * Mandarin Reader — the segmentation game.
 *
 * Model: the text is a flat sequence of characters. `cursor` is the number of
 * characters already read. The learner taps the LAST character of a word;
 * if the position right after it is a valid boundary, everything up to it
 * becomes "read" (and is shown segmented). Tapping several words ahead is
 * fine — only a tap in the middle of a word counts as a mistake.
 */
import { weightOf } from './format.js';

const global = window;

const PRAISE = [
  { min: 1, text: '对' },
  { min: 2, text: '好' },
  { min: 4, text: '不错！' },
  { min: 7, text: '太棒了！' },
  { min: 12, text: '厉害！' },
];
const STREAK_MILESTONES = [10, 25, 50, 100, 200, 400];
const SENTENCE_END = /^[。！？!?；;…]+$/;
const CLOSING = /^[”’」』）)\]】》〉]+$/;
const SCROLL_ANCHORING = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('overflow-anchor', 'auto');

function freshStats() {
  return {
    words: 0, // words segmented correctly
    taps: 0, // successful taps
    mistakes: 0,
    hints: 0,
    streak: 0, // words in a row without a mistake
    bestStreak: 0,
    startedAt: null,
    finishedAt: null,
  };
}

class Reader {
  /**
   * @param {HTMLElement} root   container to render the text into
   * @param {object} doc         output of MRFormat.normalize
   * @param {object} hooks       { onChange(reader), onWord(reader, token), onFinish(reader),
   *                               onFeedback(kind, payload), onSave(snapshot) }
   * @param {object} [progress]  a snapshot previously passed to onSave, to resume from
   */
  constructor(root, doc, hooks = {}, progress = null) {
    this.root = root;
    this.doc = doc;
    this.hooks = hooks;
    this.chars = []; // { el, tok }
    this.tokens = []; // { text, key, start, end, punct, soft:Set, block, el, wordIndex, missed }
    this.boundaries = new Set();
    this.cursor = 0;
    this.stats = freshStats();
    this.history = [];

    this._build();
    this._markSentences();
    this._restore(progress);
    this._onClick = this._onClick.bind(this);
    this.root.addEventListener('click', this._onClick);
  }

  destroy() {
    this.root.removeEventListener('click', this._onClick);
    this.root.innerHTML = '';
  }

  // ---------------------------------------------------------------- build

  _build() {
    const frag = document.createDocumentFragment();
    const lang = this.doc.meta.language || 'zh';
    let pos = 0;
    let wordIndex = 0;
    this.blockEls = [];
    this.doc.blocks.forEach((block, bi) => {
      let bEl;
      let tokParent;
      if (block.type === 'image') {
        bEl = this._buildFigure(block);
        tokParent = bEl.querySelector('figcaption');
      } else {
        bEl = document.createElement(block.type === 'heading' ? 'h2' : 'p');
        bEl.className = 'block block-' + block.type;
        bEl.lang = lang;
        tokParent = bEl;
      }
      this.blockEls.push(bEl);
      block.tokens.forEach((t) => {
        const tok = {
          text: t.text,
          key: t.key,
          punct: t.punct,
          start: pos,
          end: pos + t.chars.length,
          soft: new Set(t.soft.map((o) => pos + o)),
          block: bi,
          wordIndex: t.punct ? -1 : wordIndex++,
          missed: false,
          raw: t.raw,
          el: document.createElement('span'),
        };
        tok.el.className = tok.punct ? 'tok punct' : 'tok';
        tok.weight = tok.punct ? 0.3 : weightOf(this.doc.dictionary, t);
        tok.el.style.setProperty('--w', tok.weight);
        tok.el.dataset.t = this.tokens.length;
        t.chars.forEach((ch) => {
          const c = document.createElement('span');
          c.className = 'ch';
          c.textContent = ch;
          c.dataset.i = pos;
          tok.el.appendChild(c);
          this.chars.push({ el: c, tok });
          pos++;
        });
        this.boundaries.add(tok.start);
        this.boundaries.add(tok.end);
        tok.soft.forEach((b) => this.boundaries.add(b));
        this.tokens.push(tok);
        tokParent.appendChild(tok.el);
      });
      frag.appendChild(bEl);
    });
    this.wordCount = wordIndex;
    this.root.innerHTML = '';
    this.root.appendChild(frag);
  }

  /**
   * <figure> for an image block: the picture (or a placeholder with the alt text if it's
   * missing or fails to load), the caption (its words join the reading game) and the credit.
   */
  _buildFigure(block) {
    const fig = document.createElement('figure');
    fig.className = 'block block-image';
    const frame = document.createElement('div');
    frame.className = 'img-frame';
    fig.appendChild(frame);

    if (block.src) {
      const img = document.createElement('img');
      img.alt = block.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      if (block.width && block.height) {
        // Reserve the space before the image arrives, so the text below doesn't jump.
        img.width = block.width;
        img.height = block.height;
        img.style.aspectRatio = `${block.width} / ${block.height}`;
        img.style.width = `min(100%, ${block.width}px)`;
      } else {
        frame.classList.add('loading');
      }
      img.addEventListener('load', () => this._imageLoaded(frame), { once: true });
      img.addEventListener('error', () => frame.replaceChildren(imagePlaceholder(block.alt)), { once: true });
      img.src = block.src;
      frame.appendChild(img);
    } else {
      frame.appendChild(imagePlaceholder(block.alt));
    }

    if (block.tokens.length) {
      const cap = document.createElement('figcaption');
      cap.lang = this.doc.meta.language || 'zh';
      fig.appendChild(cap);
    }
    if (block.credit) {
      const credit = document.createElement('small');
      credit.className = 'img-credit';
      credit.textContent = block.credit;
      fig.appendChild(credit);
    }
    return fig;
  }

  /**
   * An image without a known size just loaded and changed height. Browsers with scroll
   * anchoring keep the visible text in place by themselves; elsewhere (Safari), if the image
   * is above the screen, scroll by the change so the reading position doesn't jump.
   */
  _imageLoaded(frame) {
    if (!frame.classList.contains('loading')) return;
    const before = frame.getBoundingClientRect();
    frame.classList.remove('loading');
    if (SCROLL_ANCHORING) return;
    const after = frame.getBoundingClientRect();
    if (after.bottom <= 0 && after.height !== before.height) {
      global.scrollBy({ top: after.height - before.height, behavior: 'auto' });
    }
  }

  // ---------------------------------------------------------------- state

  get finished() {
    return this.cursor >= this.chars.length;
  }

  get progress() {
    return this.chars.length ? this.cursor / this.chars.length : 1;
  }

  /** Move the cursor forward to `to`, rendering newly read characters. */
  _advance(to, animate) {
    const from = this.cursor;
    to = this._skipPunct(to);
    const completed = [];
    let delay = 0;
    for (let i = from; i < to; i++) {
      const { el, tok } = this.chars[i];
      el.classList.add('read');
      if (i + 1 === tok.end) {
        tok.el.classList.add('read', tok.wordIndex % 2 ? 'odd' : 'even');
        if (tok.missed) tok.el.classList.add('missed');
        if (!tok.punct) {
          completed.push(tok);
          if (animate) {
            tok.el.style.setProperty('--d', delay + 'ms');
            tok.el.classList.remove('pop');
            void tok.el.offsetWidth; // restart animation
            tok.el.classList.add('pop');
            delay = Math.min(delay + 45, 600);
          }
        }
      } else if (tok.soft.has(i + 1)) {
        tok.el.classList.add('partial');
      }
    }
    this.cursor = to;
    this._updateCaret();
    return completed;
  }

  _skipPunct(pos) {
    while (pos < this.chars.length && this.chars[pos].tok.punct) pos++;
    return pos;
  }

  _updateCaret() {
    const prev = this.root.querySelector('.ch.next');
    if (prev) prev.classList.remove('next');
    if (!this.finished) this.chars[this.cursor].el.classList.add('next');
  }

  // ---------------------------------------------------------------- input

  _onClick(e) {
    const img = e.target.closest('.img-frame img');
    if (img && this.root.contains(img)) {
      if (this.hooks.onImage) this.hooks.onImage(this, img);
      return;
    }
    const chEl = e.target.closest('.ch');
    if (!chEl || !this.root.contains(chEl)) return;
    this.tap(Number(chEl.dataset.i), chEl);
  }

  /** Handle a tap on the character at global index i. */
  tap(i, chEl) {
    const { tok } = this.chars[i];

    // Already read → look the word up.
    if (i < this.cursor) {
      if (!tok.punct && this.hooks.onWord) this.hooks.onWord(this, tok);
      return;
    }

    if (!this.stats.startedAt) this.stats.startedAt = Date.now();

    const end = i + 1;
    if (tok.punct || this.boundaries.has(end)) {
      this.history.push(this._snapshot());
      const completed = this._advance(end, true);
      const n = completed.length;
      this.stats.taps++;
      this.stats.words += n;
      const before = this.stats.streak;
      this.stats.streak += n;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
      this._feedback('success', {
        el: chEl,
        count: n,
        praise: praiseFor(n),
        milestone: STREAK_MILESTONES.find((m) => before < m && this.stats.streak >= m) || null,
      });
      if (this.finished) {
        this.stats.finishedAt = Date.now();
        this._save();
        if (this.hooks.onFinish) this.hooks.onFinish(this);
      }
    } else {
      // Tapped in the middle of a word.
      tok.missed = true;
      this.stats.mistakes++;
      this.stats.streak = 0;
      this._flash(tok.el, 'wrong', 650);
      this._feedback('mistake', { el: chEl, token: tok });
    }
    this._save();
    this._changed();
    this.scrollToCursor();
  }

  /** Briefly highlight the next unread word. */
  hint() {
    if (this.finished) return;
    const tok = this.chars[this.cursor].tok;
    this.stats.hints++;
    this._flash(tok.el, 'hinted', 1400);
    this._save();
    this._changed();
  }

  undo() {
    const snap = this.history.pop();
    if (!snap) return false;
    this._applySnapshot(snap);
    this._save();
    this._changed();
    return true;
  }

  reset() {
    this.history = [];
    this.stats = freshStats();
    this.cursor = 0;
    this.tokens.forEach((t) => (t.missed = false));
    this._renderFromScratch();
    this._save();
    this._changed();
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- helpers

  _flash(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  _feedback(kind, payload) {
    if (this.hooks.onFeedback) this.hooks.onFeedback(kind, payload, this);
  }

  _changed() {
    if (this.hooks.onChange) this.hooks.onChange(this);
  }

  _snapshot() {
    return {
      cursor: this.cursor,
      stats: Object.assign({}, this.stats),
      missed: this.tokens.filter((t) => t.missed).map((t) => t.start),
    };
  }

  _applySnapshot(snap) {
    this.stats = Object.assign(freshStats(), snap.stats);
    const missed = new Set(snap.missed || []);
    this.tokens.forEach((t) => (t.missed = missed.has(t.start)));
    this.cursor = 0;
    this._renderFromScratch(Math.min(snap.cursor || 0, this.chars.length));
  }

  _renderFromScratch(to = 0) {
    this.root.querySelectorAll('.read, .partial, .pop, .missed, .odd, .even').forEach((el) => {
      el.classList.remove('read', 'partial', 'pop', 'missed', 'odd', 'even');
    });
    this.cursor = 0;
    this._advance(this._skipPunct(to), false);
  }

  _save() {
    if (this.hooks.onSave) this.hooks.onSave(this._snapshot());
  }

  _restore(snap) {
    if (snap && typeof snap.cursor === 'number') this._applySnapshot(snap);
    else this._renderFromScratch(0);
  }

  /**
   * Keep the reading position at a comfortable height; only ever scrolls down unless forced.
   * When the cursor has just moved past (or into the caption of) an image, the image is
   * brought into view as well, as long as the reading position stays on screen.
   */
  scrollToCursor(force = false) {
    if (force && this.cursor === 0) {
      global.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const target = this.finished ? this.root.lastElementChild : this.chars[this.cursor].el;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const vh = global.innerHeight;
    let delta = rect.top - vh * 0.38;
    const fig = this.finished ? null : this._figureBeforeCursor();
    if (fig) {
      const figDelta = fig.getBoundingClientRect().top - vh * 0.16;
      delta = Math.max(Math.min(delta, figDelta), rect.bottom - vh * 0.85);
    }
    if (force || delta > 8) {
      global.scrollBy({ top: delta, behavior: force ? 'auto' : 'smooth' });
    }
  }

  /** The first image between the last read character and the cursor (or the cursor's own figure). */
  _figureBeforeCursor() {
    const cur = this.chars[this.cursor].tok.block;
    const prev = this.cursor > 0 ? this.chars[this.cursor - 1].tok.block : -1;
    for (let b = prev + 1; b <= cur; b++) {
      if (this.doc.blocks[b].type === 'image') return this.blockEls[b];
    }
    return null;
  }

  /** Split each block into sentences; every token gets tok.sentence = [firstTokenIndex, lastTokenIndex]. */
  _markSentences() {
    const T = this.tokens;
    let i = 0;
    while (i < T.length) {
      const start = i;
      const block = T[i].block;
      let end = i;
      while (end < T.length && T[end].block === block) {
        if (SENTENCE_END.test(T[end].text)) {
          // keep closing quotes/brackets that follow the full stop: 。”
          while (end + 1 < T.length && T[end + 1].block === block && CLOSING.test(T[end + 1].text)) end++;
          break;
        }
        end++;
      }
      if (end >= T.length || T[end].block !== block) end--; // block ended without punctuation
      for (let k = start; k <= end; k++) T[k].sentence = [start, end];
      i = end + 1;
    }
  }

  /**
   * The sentence a token appears in, for flashcard context:
   * { sentence, start, length } — start/length locate the word inside the sentence (in characters).
   */
  contextFor(tok) {
    const [a, b] = tok.sentence;
    let sentence = '';
    let start = 0;
    for (let k = a; k <= b; k++) {
      if (this.tokens[k] === tok) start = [...sentence].length;
      sentence += this.tokens[k].text;
    }
    return { sentence, start, length: [...tok.text].length };
  }

  missedTokens() {
    const seen = new Set();
    return this.tokens.filter((t) => {
      if (!t.missed || seen.has(t.key)) return false;
      seen.add(t.key);
      return true;
    });
  }
}

function imagePlaceholder(alt) {
  const el = document.createElement('div');
  el.className = 'img-missing';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', alt || 'Image not available');
  el.textContent = alt || 'Image not available';
  return el;
}

function praiseFor(n) {
  let p = PRAISE[0].text;
  for (const step of PRAISE) if (n >= step.min) p = step.text;
  return p;
}

export default Reader;
