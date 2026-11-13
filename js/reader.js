/*
 * Mandarin Reader — the segmentation game.
 *
 * Model: the text is a flat sequence of characters. `cursor` is the number of
 * characters already read. The learner taps the LAST character of a word;
 * if the position right after it is a valid boundary, everything up to it
 * becomes "read" (and is shown segmented). Tapping several words ahead is
 * fine — only a tap in the middle of a word counts as a mistake.
 */
(function (global) {
  'use strict';

  const PRAISE = [
    { min: 1, text: '对' },
    { min: 2, text: '好' },
    { min: 4, text: '不错！' },
    { min: 7, text: '太棒了！' },
    { min: 12, text: '厉害！' },
  ];
  const STREAK_MILESTONES = [10, 25, 50, 100, 200, 400];

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
     * @param {object} hooks       { onChange(reader), onWord(reader, token), onFinish(reader), onFeedback(kind, payload) }
     */
    constructor(root, doc, hooks = {}) {
      this.root = root;
      this.doc = doc;
      this.hooks = hooks;
      this.chars = []; // { el, tok }
      this.tokens = []; // { text, key, start, end, punct, soft:Set, block, el, wordIndex, missed }
      this.boundaries = new Set();
      this.cursor = 0;
      this.stats = freshStats();
      this.history = [];
      this.storageKey = 'mr:progress:' + doc.meta.id;

      this._build();
      this._restore();
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
      let pos = 0;
      let wordIndex = 0;
      this.doc.blocks.forEach((block, bi) => {
        const tag = block.type === 'heading' ? 'h2' : 'p';
        const bEl = document.createElement(tag);
        bEl.className = 'block block-' + block.type;
        bEl.lang = this.doc.meta.language || 'zh';
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
          bEl.appendChild(tok.el);
        });
        frag.appendChild(bEl);
      });
      this.wordCount = wordIndex;
      this.root.innerHTML = '';
      this.root.appendChild(frag);
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
      try {
        const snap = this._snapshot();
        localStorage.setItem(this.storageKey, JSON.stringify(snap));
      } catch (_) {
        /* storage unavailable: progress simply isn't kept */
      }
    }

    _restore() {
      let snap = null;
      try {
        snap = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      } catch (_) {
        snap = null;
      }
      if (snap && typeof snap.cursor === 'number') this._applySnapshot(snap);
      else this._renderFromScratch(0);
    }

    /** Keep the reading position at a comfortable height; only ever scrolls down unless forced. */
    scrollToCursor(force = false) {
      const target = this.finished ? this.root.lastElementChild : this.chars[this.cursor].el;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const desired = global.innerHeight * 0.38;
      const delta = rect.top - desired;
      if (force || delta > 8) {
        global.scrollBy({ top: delta, behavior: force ? 'auto' : 'smooth' });
      }
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

  function praiseFor(n) {
    let p = PRAISE[0].text;
    for (const step of PRAISE) if (n >= step.min) p = step.text;
    return p;
  }

  global.MRReader = Reader;
})(window);
