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
