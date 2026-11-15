/* Flashcards overview: what's due, the card list (search, inspect, delete), export. */
import * as flashcards from '../flashcards.js';
import { counts, formatInterval } from '../srs.js';
import { $, h, speak, canSpeak, contextEl, download } from '../ui.js';

let initialized = false;
let allCards = [];

export const el = () => $('#view-cards');

function init() {
  if (initialized) return;
  initialized = true;
  $('#c-search').addEventListener('input', renderList);
  const npd = $('#c-newperday');
  npd.value = flashcards.newPerDay();
  npd.addEventListener('change', () => {
    flashcards.setNewPerDay(Number(npd.value));
    npd.value = flashcards.newPerDay();
    renderSummary();
  });
  $('#cards-export').addEventListener('click', () => {
    if (!allCards.length) return;
    const d = new Date().toISOString().slice(0, 10);
    download(`mandarin-reader-cards-${d}.txt`, flashcards.toTsv(allCards), 'text/tab-separated-values');
  });
  flashcards.events.addEventListener('change', () => {
    if (!el().hidden) show();
  });
}

export async function show() {
  init();
  allCards = await flashcards.all();
  allCards.sort((a, b) => b.createdAt - a.createdAt);
  renderSummary();
  renderList();
}

export function hide() {}

function renderSummary() {
  const c = counts(allCards, flashcards.newAllowance());
  $('#c-due').textContent = c.toStudy;
  $('#c-new').textContent = c.fresh;
  $('#c-total').textContent = c.total;
  const study = $('#c-study');
  study.classList.toggle('disabled', !c.toStudy);
  study.setAttribute('aria-disabled', String(!c.toStudy));
  study.textContent = c.toStudy ? `Study now (${c.toStudy})` : nextDueText(allCards);
  $('#cards-export').disabled = !allCards.length;
  $('#c-empty').hidden = !!allCards.length;
  $('#c-search').hidden = !allCards.length;
}

function nextDueText(cards) {
  const future = cards.filter((c) => c.srs.state !== 'new').map((c) => c.srs.due).sort((a, b) => a - b)[0];
  if (!cards.length) return 'Nothing to study yet';
  if (future) return `Nothing due · next in ${formatInterval(future - Date.now())}`;
  return 'Daily new-card limit reached';
}

function matches(card, q) {
  if (!q) return true;
  q = q.toLowerCase();
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return (
    card.hanzi.includes(q) ||
    plain(card.pinyin).replace(/\s/g, '').includes(plain(q).replace(/\s/g, '')) ||
    card.meanings.some((m) => m.toLowerCase().includes(q)) ||
    card.contexts.some((c) => c.sentence.includes(q))
  );
}

function dueLabel(card) {
  if (card.srs.state === 'new') return { text: 'new', cls: 'new' };
  const ms = card.srs.due - Date.now();
  if (ms <= 0) return { text: 'due', cls: 'due' };
  return { text: formatInterval(ms), cls: '' };
}

function renderList() {
  const q = $('#c-search').value.trim();
  const list = allCards.filter((c) => matches(c, q));
  // keep expanded cards expanded across re-renders (e.g. after removing a sentence)
  const open = new Set([...document.querySelectorAll('#c-list details[open]')].map((d) => d.dataset.id));
  $('#c-list').replaceChildren(...list.map((c) => cardItem(c, open.has(c.id))));
}

function cardItem(card, isOpen) {
  const due = dueLabel(card);
  const contexts = card.contexts.map((ctx, i) =>
    h(
      'div.ctx-row',
      null,
      contextEl(ctx),
      h(
        'div.ctx-meta',
        null,
        ctx.textId ? h('a', { href: '#/read/' + encodeURIComponent(ctx.textId) }, ctx.textTitle || 'source') : h('span', null, ctx.textTitle || ''),
        card.contexts.length > 1
          ? h('button.link', { onclick: () => flashcards.removeContext(card, i), title: 'Remove this sentence' }, 'remove')
          : null
      )
    )
  );
  return h(
    'details.card-item',
    { dataset: { id: card.id }, open: !!isOpen },
    h(
      'summary',
      null,
      h('span.ci-hanzi', { lang: 'zh' }, card.hanzi),
      h('span.ci-py', null, card.pinyin),
      h('span.ci-en', null, card.meanings[0] || ''),
      h('span.ci-due.' + (due.cls || 'later'), null, due.text)
    ),
    h(
      'div.ci-body',
      null,
      h('ol.ci-meanings', null, card.meanings.map((m) => h('li', null, m))),
      contexts,
      h(
        'div.button-row',
        null,
        canSpeak ? h('button.btn', { onclick: () => speak(card.hanzi) }, '🔊 Listen') : null,
        h('span.muted.small', null, `Reviewed ${card.srs.reps}× · ${card.srs.lapses} lapses`),
        h('span.spacer'),
        h('button.btn.danger', {
          onclick: () => {
            if (confirm(`Delete the card for ${card.hanzi}?`)) flashcards.remove(card.id);
          },
        }, 'Delete')
      )
    )
  );
}
