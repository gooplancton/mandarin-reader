/* "My library": example texts and uploads, with reading progress; upload, backup, restore. */
import * as library from '../library.js';
import * as db from '../db.js';
import { $, h, toast, download, bylineText } from '../ui.js';

let initialized = false;

export const el = () => $('#view-library');

function init() {
  if (initialized) return;
  initialized = true;
  $('#lib-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    await importFiles(files);
  });
  $('#lib-backup').addEventListener('click', backup);
  $('#lib-restore').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await importFiles([f]);
  });
}

export async function show() {
  init();
  await render();
}

export function hide() {}

function showWarnings(list) {
  const w = $('#lib-warnings');
  w.hidden = !list.length;
  w.textContent = list.join('\n');
}

const opened = (x) => (x.progress && (x.progress.openedAt || x.progress.updatedAt)) || 0;
const cursorOf = (x) => Math.min(x.chars || 0, x.progress ? x.progress.cursor || 0 : 0);
const isFinished = (x) => !x.error && x.chars > 0 && cursorOf(x) >= x.chars;
const hrefOf = (id) => '#/read/' + encodeURIComponent(id);

async function render() {
  const entries = library.group(await library.list());
  // A book's activity is that of its most recently read chapter.
  const activity = (e) => (e.text ? opened(e.text) : Math.max(...e.book.chapters.map(opened)));
  const builtInOnly = (e) => (e.text ? e.text.builtIn : e.book.chapters.every((c) => c.builtIn));
  entries.sort(
    (a, b) => activity(b) - activity(a) || (builtInOnly(a) === builtInOnly(b) ? 0 : builtInOnly(a) ? 1 : -1)
  );
  $('#lib-list').replaceChildren(...entries.map((e) => (e.text ? textCard(e.text) : bookCard(e.book))));
}

function levelOf(m) {
  return m.level ? `${m.level.system || ''} ${m.level.value || ''}`.trim() : '';
}

/** A ⋯ menu from a list of { label, danger, onclick } (falsy entries skipped); hidden when empty. */
function menuEl(actions) {
  const menu = h(
    'details.menu',
    null,
    h('summary.btn.icon', { 'aria-label': 'More actions', title: 'More actions' }, '⋯'),
    h(
      'div.menu-pop',
      null,
      actions.filter(Boolean).map((a) => h('button' + (a.danger ? '.danger' : ''), { onclick: a.onclick }, a.label))
    )
  );
  if (!menu.querySelector('.menu-pop').children.length) menu.hidden = true;
  return menu;
}

/** Menu of a text or chapter: reset progress, remove (uploads only). */
function itemMenu(item, name) {
  return menuEl([
    cursorOf(item) && {
      label: 'Reset progress',
      onclick: async () => {
        if (!confirm(`Reset your progress on “${name}”?`)) return;
        await library.resetProgress(item.id);
        render();
      },
    },
    !item.builtIn && {
      label: item.meta && item.meta.book && !item.error ? 'Remove chapter' : 'Remove text',
      danger: true,
      onclick: async () => {
        if (!confirm(`Remove “${name}” and your progress on it from this device?`)) return;
        await library.remove(item.id);
        if (db.prefs.get('lastText') === item.id) db.prefs.set('lastText', null);
        render();
      },
    },
  ]);
}

function textCard(item) {
  const m = item.meta || {};
  const cursor = cursorOf(item);
  const pct = item.chars ? Math.min(100, Math.round((100 * cursor) / item.chars)) : 0;
  const finished = isFinished(item);
  const status = item.error ? 'Invalid file' : finished ? 'Finished ✓' : cursor ? `${pct}% read` : 'Not started';
  const action = finished ? 'Read again' : cursor ? 'Continue' : 'Read';
  const level = levelOf(m);
  const href = hrefOf(item.id);

  return h(
    'article.text-card' + (finished ? '.finished' : ''),
    null,
    h(
      'a.text-main',
      { href: item.error ? null : href },
      h('div.text-title', { lang: 'zh' }, m.title || item.id),
      m.titleTranslation ? h('div.text-sub', null, m.titleTranslation) : null,
      bylineText(m) ? h('div.text-by', null, bylineText(m)) : null,
      h(
        'div.text-info',
        null,
        level ? h('span.tag', null, level) : null,
        item.builtIn ? h('span.tag.neutral', null, 'Included') : null,
        item.error ? h('span', null, item.error) : h('span', null, `${item.words} words · ${item.chars} characters`)
      ),
      h('div.text-progress', null, h('div', { style: { width: pct + '%' } })),
      h('div.text-status', null, status)
    ),
    h(
      'div.text-actions',
      null,
      item.error ? null : h('a.btn' + (cursor && !finished ? '.primary' : ''), { href }, action),
      itemMenu(item, m.title || item.id)
    )
  );
}

/** One card for a whole book (texts sharing meta.book.id); expands to list its chapters. */
function bookCard(book) {
  const chs = book.chapters;
  const total = chs.reduce((n, c) => n + c.chars, 0);
  const read = chs.reduce((n, c) => n + cursorOf(c), 0);
  const words = chs.reduce((n, c) => n + c.words, 0);
  const pct = total ? Math.min(100, Math.floor((100 * read) / total)) : 0;
  const done = chs.filter(isFinished).length;
  const finished = done === chs.length;
  const next = chs.find((c) => !isFinished(c)) || chs[0]; // first unfinished chapter
  const href = hrefOf(next.id);
  const status = finished
    ? 'Finished ✓'
    : read
      ? `${read} / ${total} characters read (${pct}%)`
      : 'Not started';
  const action = finished ? 'Read again' : read ? 'Continue' : 'Read';
  const level = book.level ? levelOf({ level: book.level }) : '';
  const allBuiltIn = chs.every((c) => c.builtIn);
  const uploads = chs.filter((c) => !c.builtIn);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const menu = menuEl([
    read && {
      label: 'Reset progress',
      onclick: async () => {
        if (!confirm(`Reset your progress on every chapter of “${book.title}”?`)) return;
        for (const c of chs) await library.resetProgress(c.id);
        render();
      },
    },
    uploads.length && {
      // A book could mix example and uploaded chapters: only uploads can be removed.
      label: uploads.length === chs.length ? 'Remove book' : 'Remove uploaded chapters',
      danger: true,
      onclick: async () => {
        const what =
          uploads.length === chs.length
            ? `the book “${book.title}” (${plural(chs.length, 'chapter')})`
            : `the ${plural(uploads.length, 'uploaded chapter')} of “${book.title}”`;
        if (!confirm(`Remove ${what} and your progress on it from this device?`)) return;
        const last = db.prefs.get('lastText');
        for (const c of uploads) {
          await library.remove(c.id);
          if (last === c.id) db.prefs.set('lastText', null);
        }
        render();
      },
    },
  ]);

  const chapterRow = (c) => {
    const cur = cursorOf(c);
    const fin = isFinished(c);
    const p = c.chars ? Math.min(100, Math.round((100 * cur) / c.chars)) : 0;
    const label = library.chapterLabel(c.meta);
    return h(
      'li.chapter' + (fin ? '.finished' : '') + (c === next && !finished ? '.current' : ''),
      null,
      h(
        'a.chapter-main',
        { href: hrefOf(c.id) },
        h(
          'span.chapter-line',
          null,
          h('span.chapter-title', { lang: 'zh' }, label),
          h('span.chapter-status', null, fin ? 'Finished ✓' : cur ? `${p}%` : `${c.chars} chars`)
        ),
        h('span.text-progress.thin', null, h('span', { style: { width: p + '%' } }))
      ),
      itemMenu(c, label)
    );
  };

  return h(
    'article.text-card.book-card' + (finished ? '.finished' : ''),
    null,
    h(
      'a.text-main',
      { href },
      h('div.text-title', { lang: 'zh' }, book.title),
      book.titleTranslation ? h('div.text-sub', null, book.titleTranslation) : null,
      h(
        'div.text-info',
        null,
        level ? h('span.tag', null, level) : null,
        allBuiltIn ? h('span.tag.neutral', null, 'Included') : null,
        h('span', null, [book.author, plural(chs.length, 'chapter'), `${words} words`].filter(Boolean).join(' · '))
      ),
      h('div.text-progress', null, h('div', { style: { width: pct + '%' } })),
      h('div.text-status', null, status)
    ),
    h('div.text-actions', null, h('a.btn' + (read && !finished ? '.primary' : ''), { href }, action), menu),
    h(
      'details.chapters',
      null,
      h('summary', null, `${plural(chs.length, 'chapter')} · ${done} finished`),
      h('ol.chapter-list', null, chs.map(chapterRow))
    )
  );
}

// ------------------------------------------------------------ import

/** Import dropped/uploaded files: texts or a backup. Used by the page-wide drop handler too. */
export async function importFiles(files) {
  const warnings = [];
  const added = []; // results of library.addUpload, for one summary toast
  let lastId = null;
  for (const f of files) {
    let raw;
    try {
      raw = JSON.parse(await f.text());
    } catch (err) {
      warnings.push(`${f.name}: not a JSON file (${err.message})`);
      continue;
    }
    try {
      if (raw && raw.format === db.BACKUP_FORMAT) {
        if (!confirm(`Restore the backup “${f.name}”? Texts, progress and cards in it will be merged into this device.`)) continue;
        const n = await db.importAll(raw);
        toast(`Restored ${n.texts} texts, ${n.cards} cards`);
      } else {
        const res = await library.addUpload(raw);
        lastId = res.id;
        res.warnings.forEach((w) => warnings.push(`${f.name}: ${w}`));
        added.push(res);
      }
    } catch (err) {
      warnings.push(`${f.name}: ${err.message || err}`);
    }
  }
  if (added.length) toast(addedMessage(added));
  showWarnings(warnings);
  if (!el().hidden) await render();
  return lastId;
}

/** "Added “Title”", "Added 3 chapters of 茶馆", "Added 2 texts, 1 chapter of 茶馆"… */
function addedMessage(added) {
  const books = new Map();
  const texts = [];
  for (const a of added) {
    if (!a.book) texts.push(a);
    else {
      if (!books.has(a.book.id)) books.set(a.book.id, { title: a.book.title, n: 0 });
      books.get(a.book.id).n++;
    }
  }
  const parts = [];
  if (texts.length === 1) parts.push(`“${texts[0].title}”`);
  else if (texts.length) parts.push(`${texts.length} texts`);
  for (const b of books.values()) parts.push(`${b.n} chapter${b.n === 1 ? '' : 's'} of ${b.title}`);
  return 'Added ' + parts.join(', ');
}

async function backup() {
  const data = await db.exportAll();
  const d = new Date().toISOString().slice(0, 10);
  download(`mandarin-reader-backup-${d}.json`, JSON.stringify(data));
}
