(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch (_) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (_) {}
    },
  };

  const els = {
    select: $('#text-select'),
    file: $('#file-input'),
    reader: $('#reader'),
    meta: $('#text-meta'),
    words: $('#stat-words'),
    streak: $('#stat-streak'),
    mistakes: $('#stat-mistakes'),
    accuracy: $('#stat-accuracy'),
    progress: $('#progress-bar'),
    fx: $('#fx-layer'),
    toast: $('#toast'),
    sheet: $('#word-sheet'),
    finish: $('#finish'),
    warnings: $('#warnings'),
  };

  /** All available raw documents, by id. */
  const library = new Map();
  (window.MR_LIBRARY || []).forEach((d) => library.set(d.meta.id, d));

  let reader = null;
  let current = null; // normalized doc
  let selectedTok = null;

  // ------------------------------------------------------------ library

  function refreshSelect(activeId) {
    els.select.innerHTML = '';
    for (const [id, d] of library) {
      const o = document.createElement('option');
      o.value = id;
      const lvl = d.meta.level ? ` · ${d.meta.level.system || ''}${d.meta.level.value || ''}` : '';
      o.textContent = d.meta.title + lvl;
      els.select.appendChild(o);
    }
    if (activeId) els.select.value = activeId;
  }

  function open(id) {
    const raw = library.get(id);
    if (!raw) return;
    let doc;
    try {
      doc = MRFormat.normalize(raw);
    } catch (err) {
      showWarnings([String(err.message || err)]);
      return;
    }
    showWarnings(doc.warnings);
    if (reader) reader.destroy();
    closeSheet();
    closeFinish();
    current = doc;
    store.set('mr:lastText', id);
    renderMeta(doc.meta);
    reader = new MRReader(els.reader, doc, {
      onChange: updateStats,
      onWord: showWord,
      onFinish: showFinish,
      onFeedback: feedback,
    });
    updateStats(reader);
    requestAnimationFrame(() => reader.scrollToCursor(true));
  }

  function renderMeta(meta) {
    const bits = [];
    if (meta.titleTranslation) bits.push(meta.titleTranslation);
    if (meta.level) bits.push(`${meta.level.system || ''} ${meta.level.value || ''}`.trim());
    if (meta.author) bits.push(meta.author);
    els.meta.textContent = bits.join(' · ');
  }

  function showWarnings(list) {
    els.warnings.hidden = !list.length;
    els.warnings.textContent = list.join('\n');
  }

  els.select.addEventListener('change', () => open(els.select.value));

  els.file.addEventListener('change', async () => {
    const f = els.file.files[0];
    els.file.value = '';
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      const doc = MRFormat.normalize(raw); // validate before adding
      library.set(doc.meta.id, Object.assign({}, raw, { meta: doc.meta }));
      refreshSelect(doc.meta.id);
      open(doc.meta.id);
    } catch (err) {
      showWarnings([`Could not open ${f.name}: ${err.message || err}`]);
    }
  });

  // ------------------------------------------------------------ stats

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

  // ------------------------------------------------------------ feedback

  function feedback(kind, p) {
    const rect = p.el.getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'fx fx-' + kind;
    fx.style.left = rect.left + rect.width / 2 + 'px';
    fx.style.top = rect.top + 'px';
    if (kind === 'success') {
      fx.textContent = p.count > 0 ? `${p.praise} +${p.count}` : '✓';
      if (p.count >= 4) fx.classList.add('big');
      if (p.milestone) toast(`连对 ${p.milestone} 个词！ ${p.milestone} in a row`);
    } else {
      fx.textContent = '✗';
      buzz();
    }
    els.fx.appendChild(fx);
    setTimeout(() => fx.remove(), 1100);
  }

  let toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function buzz() {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(60);
      } catch (_) {}
    }
  }

  // ------------------------------------------------------------ word sheet

  function showWord(r, tok) {
    if (selectedTok) selectedTok.el.classList.remove('selected');
    selectedTok = tok;
    tok.el.classList.add('selected');

    const entry = MRFormat.lookup(r.doc.dictionary, tok.key);
    $('#ws-hanzi').textContent = tok.text;
    $('#ws-pinyin').textContent = entry ? entry.py || '' : '';
    const defs = $('#ws-defs');
    defs.innerHTML = '';
    (entry ? entry.en : ['(no dictionary entry)']).forEach((d) => {
      const li = document.createElement('li');
      li.textContent = d;
      defs.appendChild(li);
    });

    const parts = entry && Array.isArray(entry.parts) ? entry.parts : [];
    const partsEl = $('#ws-parts');
    partsEl.innerHTML = '';
    partsEl.hidden = !parts.length;
    if (parts.length) {
      partsEl.appendChild(document.createTextNode('Parts: '));
      parts.forEach((p, i) => {
        if (i) partsEl.appendChild(document.createTextNode(' + '));
        const sub = MRFormat.lookup(r.doc.dictionary, p);
        const b = document.createElement('span');
        b.className = 'part';
        b.textContent = p;
        if (sub) b.title = `${sub.py} — ${sub.en.join('; ')}`;
        partsEl.appendChild(b);
      });
    }

    const notes = $('#ws-notes');
    notes.textContent = entry && entry.notes ? entry.notes : '';
    notes.hidden = !notes.textContent;
    const tag = $('#ws-tag');
    tag.textContent = entry && entry.hsk ? 'HSK ' + entry.hsk : '';
    tag.hidden = !tag.textContent;
    $('#ws-speak').hidden = !('speechSynthesis' in window);

    els.sheet.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    els.sheet.classList.remove('open');
    els.sheet.setAttribute('aria-hidden', 'true');
    if (selectedTok) selectedTok.el.classList.remove('selected');
    selectedTok = null;
  }

  $('#ws-close').addEventListener('click', closeSheet);
  $('#ws-speak').addEventListener('click', () => {
    if (!selectedTok) return;
    const u = new SpeechSynthesisUtterance(selectedTok.text);
    u.lang = 'zh-CN';
    u.rate = 0.8;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSheet();
      closeFinish();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && reader) {
      e.preventDefault();
      reader.undo();
    }
  });
  // Tapping anywhere outside the sheet (and not on a read word) closes it.
  document.addEventListener('click', (e) => {
    if (!els.sheet.classList.contains('open')) return;
    if (els.sheet.contains(e.target)) return;
    const ch = e.target.closest('.ch.read');
    if (ch) return;
    closeSheet();
  });

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
    const list = $('#f-missed');
    list.innerHTML = '';
    $('#f-missed-wrap').hidden = !missed.length;
    missed.forEach((t) => {
      const e = MRFormat.lookup(r.doc.dictionary, t.key);
      const li = document.createElement('li');
      li.innerHTML = '<span class="h"></span> <span class="py"></span> <span class="en"></span>';
      li.querySelector('.h').textContent = t.text;
      li.querySelector('.py').textContent = e ? e.py : '';
      li.querySelector('.en').textContent = e ? e.en.join('; ') : '';
      list.appendChild(li);
    });
    setTimeout(() => els.finish.classList.add('open'), 500);
  }

  function closeFinish() {
    els.finish.classList.remove('open');
  }

  function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  $('#f-review').addEventListener('click', closeFinish);
  $('#f-restart').addEventListener('click', () => {
    closeFinish();
    reader.reset();
  });

  // ------------------------------------------------------------ toolbar

  $('#btn-undo').addEventListener('click', () => reader && reader.undo());
  $('#btn-hint').addEventListener('click', () => reader && reader.hint());
  $('#btn-reset').addEventListener('click', () => {
    if (reader && confirm('Start this text again from the beginning?')) reader.reset();
  });

  let fontSize = store.get('mr:fontSize', 28);
  function applyFont() {
    document.documentElement.style.setProperty('--fs', fontSize + 'px');
    store.set('mr:fontSize', fontSize);
  }
  $('#btn-font-down').addEventListener('click', () => {
    fontSize = Math.max(18, fontSize - 2);
    applyFont();
  });
  $('#btn-font-up').addEventListener('click', () => {
    fontSize = Math.min(48, fontSize + 2);
    applyFont();
  });
  applyFont();

  // ------------------------------------------------------------ boot

  const params = new URLSearchParams(location.search);
  const first = params.get('text') || store.get('mr:lastText', null);
  const startId = library.has(first) ? first : library.keys().next().value;
  refreshSelect(startId);
  if (startId) open(startId);
  else showWarnings(['No texts found. Use “Open…” to load a .json text file.']);
})();
