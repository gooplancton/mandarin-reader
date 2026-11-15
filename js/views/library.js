/* "My library": example texts and uploads, with reading progress; upload, backup, restore. */
import * as library from '../library.js';
import * as db from '../db.js';
import { $, h, toast, download } from '../ui.js';

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

async function render() {
  const items = await library.list();
  const opened = (x) => (x.progress && (x.progress.openedAt || x.progress.updatedAt)) || 0;
  items.sort((a, b) => opened(b) - opened(a) || (a.builtIn === b.builtIn ? 0 : a.builtIn ? 1 : -1));
  $('#lib-list').replaceChildren(...items.map(textCard));
}

function textCard(item) {
  const m = item.meta || {};
  const cursor = item.progress ? item.progress.cursor || 0 : 0;
  const pct = item.chars ? Math.min(100, Math.round((100 * cursor) / item.chars)) : 0;
  const finished = item.chars && cursor >= item.chars;
  const status = item.error ? 'Invalid file' : finished ? 'Finished ✓' : cursor ? `${pct}% read` : 'Not started';
  const action = finished ? 'Read again' : cursor ? 'Continue' : 'Read';
  const level = m.level ? `${m.level.system || ''} ${m.level.value || ''}`.trim() : '';
  const href = '#/read/' + encodeURIComponent(item.id);

  const menu = h(
    'details.menu',
    null,
    h('summary.btn.icon', { 'aria-label': 'More actions', title: 'More actions' }, '⋯'),
    h(
      'div.menu-pop',
      null,
      cursor
        ? h('button', {
            onclick: async () => {
              if (!confirm(`Reset your progress on “${m.title}”?`)) return;
              await library.resetProgress(item.id);
              render();
            },
          }, 'Reset progress')
        : null,
      item.builtIn
        ? null
        : h('button.danger', {
            onclick: async () => {
              if (!confirm(`Remove “${m.title}” and your progress on it from this device?`)) return;
              await library.remove(item.id);
              if (db.prefs.get('lastText') === item.id) db.prefs.set('lastText', null);
              render();
            },
          }, 'Remove text')
    )
  );
  if (!menu.querySelector('.menu-pop').children.length) menu.hidden = true;

  return h(
    'article.text-card' + (finished ? '.finished' : ''),
    null,
    h(
      'a.text-main',
      { href: item.error ? null : href },
      h('div.text-title', { lang: 'zh' }, m.title || item.id),
      m.titleTranslation ? h('div.text-sub', null, m.titleTranslation) : null,
      h(
        'div.text-info',
        null,
        level ? h('span.tag', null, level) : null,
        item.builtIn ? h('span.tag.neutral', null, 'Example') : null,
        item.error ? h('span', null, item.error) : h('span', null, `${item.words} words · ${item.chars} characters`)
      ),
      h('div.text-progress', null, h('div', { style: { width: pct + '%' } })),
      h('div.text-status', null, status)
    ),
    h('div.text-actions', null, item.error ? null : h('a.btn' + (cursor && !finished ? '.primary' : ''), { href }, action), menu)
  );
}

// ------------------------------------------------------------ import

/** Import dropped/uploaded files: texts or a backup. Used by the page-wide drop handler too. */
export async function importFiles(files) {
  const warnings = [];
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
        toast(`Added “${res.title}”`);
      }
    } catch (err) {
      warnings.push(`${f.name}: ${err.message || err}`);
    }
  }
  showWarnings(warnings);
  if (!el().hidden) await render();
  return lastId;
}

async function backup() {
  const data = await db.exportAll();
  const d = new Date().toISOString().slice(0, 10);
  download(`mandarin-reader-backup-${d}.json`, JSON.stringify(data));
}
