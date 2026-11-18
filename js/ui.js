/* Small shared UI helpers. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Create an element: h('div.card', { onclick }, child, 'text', …) */
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

let toastTimer = 0;
/** Show a short message. `action` = { label, onClick } adds a button. */
export function toast(msg, action, ms = 2400) {
  const el = $('#toast');
  el.innerHTML = '';
  el.appendChild(document.createTextNode(msg));
  if (action) {
    el.appendChild(h('button.toast-action', { onclick: action.onClick }, action.label));
    ms = Math.max(ms, 8000);
  }
  el.classList.toggle('interactive', !!action);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text) {
  if (!canSpeak || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.8;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function buzz(ms = 60) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) {}
}

/** Trigger a download of `data` as a file. */
export function download(filename, data, type = 'application/json') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Render a context sentence with the word highlighted. */
export function contextEl(ctx, tag = 'p.context') {
  const s = [...ctx.sentence];
  const before = s.slice(0, ctx.start).join('');
  const word = s.slice(ctx.start, ctx.start + ctx.length).join('');
  const after = s.slice(ctx.start + ctx.length).join('');
  return h(tag, { lang: 'zh' }, before, h('mark', null, word), after);
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ------------------------------------------------------------ attribution

/** "CC-BY-NC-4.0" → "CC BY-NC 4.0"; other values unchanged. */
export function licenseLabel(id) {
  const m = /^CC-(BY(?:-NC)?(?:-SA|-ND)?)-(\d\.\d)$/i.exec(id || '');
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  if (/^CC0-1\.0$/i.test(id || '')) return 'CC0 1.0';
  return id || '';
}

function licenseHref(meta) {
  if (meta.licenseUrl) return meta.licenseUrl;
  const m = /^CC-(BY(?:-NC)?(?:-SA|-ND)?)-(\d\.\d)$/i.exec(meta.license || '');
  if (m) return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/`;
  if (/^CC0-1\.0$/i.test(meta.license || '')) return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return null;
}

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

/** "by Author · Site" for cards, or '' when the text names no author/source. */
export function bylineText(meta) {
  const s = meta.source && typeof meta.source === 'object' ? meta.source : {};
  const author = s.author || (meta.book && meta.book.author) || meta.author;
  return [author ? 'by ' + author : '', s.name || ''].filter(Boolean).join(' · ');
}

/**
 * Credit line for a text (required by CC licenses): original title + link, author, site, date,
 * license with link, and what was changed. Returns null when there is nothing to credit.
 */
export function attributionEl(meta) {
  const s = meta.source && typeof meta.source === 'object' ? meta.source : {};
  const author = s.author || meta.author;
  if (!author && !s.url && !meta.license) return null;
  const parts = [];
  const url = safeUrl(s.url);
  parts.push('Source: ', url ? h('a', { href: url, target: '_blank', rel: 'noopener', lang: 'zh' }, meta.title || url) : h('span', { lang: 'zh' }, meta.title || ''));
  if (author) parts.push(' by ', author);
  if (s.name) parts.push(', ', s.name);
  if (s.published) parts.push(` (${String(s.published).slice(0, 10)})`);
  parts.push('.');
  if (meta.license) {
    const href = safeUrl(licenseHref(meta));
    parts.push(' License: ', href ? h('a', { href, target: '_blank', rel: 'noopener' }, licenseLabel(meta.license)) : licenseLabel(meta.license), '.');
  }
  if (meta.modifications) parts.push(' ', String(meta.modifications));
  return h('p.source-note', null, parts);
}
