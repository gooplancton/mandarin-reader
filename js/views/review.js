/* Study session: show a card (word + the sentence it came from), reveal, grade. */
import * as flashcards from '../flashcards.js';
import { GRADES, schedule, previews, pickNext, counts, formatInterval } from '../srs.js';
import { $, h, speak, canSpeak, contextEl } from '../ui.js';

let initialized = false;
let cards = [];
let current = null;
let revealed = false;
let reviewedThisSession = 0;

export const el = () => $('#view-review');

function init() {
  if (initialized) return;
  initialized = true;
  $('#rv-show').addEventListener('click', reveal);
  $('#rv-card').addEventListener('click', (e) => {
    if (!revealed && !e.target.closest('button')) reveal();
  });
  $('#rv-speak').addEventListener('click', () => current && speak(current.hanzi));
  document.addEventListener('keydown', (e) => {
    if (el().hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches('input, textarea')) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      reveal();
    } else if (revealed && current) {
      const g = GRADES.find((x) => x.key === e.key || (e.key === ' ' && x.grade === 3));
      if (g) {
        e.preventDefault();
        grade(g.grade);
      }
    }
  });
}

export async function show() {
  init();
  cards = await flashcards.all();
  reviewedThisSession = 0;
  next();
}

export function hide() {
  current = null;
}

function next(excludeId) {
  current = pickNext(cards, { newAllowance: flashcards.newAllowance(), exclude: excludeId });
  revealed = false;
  updateCounts();
  const done = !current;
  $('#rv-card').hidden = done;
  $('#rv-show').hidden = done;
  $('#rv-grades').hidden = true;
  $('#rv-done').hidden = !done;
  if (done) {
    const future = cards.filter((c) => c.srs.state !== 'new').map((c) => c.srs.due).sort((a, b) => a - b)[0];
    const parts = [];
    if (reviewedThisSession) parts.push(`You reviewed ${reviewedThisSession} card${reviewedThisSession > 1 ? 's' : ''}.`);
    if (future) parts.push(`Next card due in ${formatInterval(future - Date.now())}.`);
    else if (!cards.length) parts.push('Add words from the reader to start.');
    $('#rv-next').textContent = parts.join(' ');
    return;
  }
  renderFront();
}

function updateCounts() {
  const c = counts(cards, flashcards.newAllowance());
  $('#rv-counts').replaceChildren(
    h('span.cnt-new', { title: 'New' }, String(c.newToday)),
    h('span.cnt-learn', { title: 'Learning' }, String(c.learning)),
    h('span.cnt-review', { title: 'To review' }, String(c.review))
  );
}

/** Rotate through saved sentences so the word is seen in different contexts. */
function pickContext(card) {
  if (!card.contexts.length) return null;
  return card.contexts[card.srs.reps % card.contexts.length];
}

function renderFront() {
  const c = current;
  $('#rv-hanzi').textContent = c.hanzi;
  const ctx = pickContext(c);
  $('#rv-context').replaceChildren(ctx ? contextEl(ctx) : '');
  $('#rv-back').hidden = true;
  $('#rv-pinyin').textContent = c.pinyin;
  $('#rv-speak').hidden = !canSpeak;
  $('#rv-meanings').replaceChildren(...c.meanings.map((m) => h('li', null, m)));
  $('#rv-source').textContent = ctx && ctx.textTitle ? '— ' + ctx.textTitle : '';
  $('#rv-show').hidden = false;
  $('#rv-card').classList.remove('flipped');
  $('#rv-card').focus({ preventScroll: true });
}

function reveal() {
  if (!current || revealed) return;
  revealed = true;
  $('#rv-back').hidden = false;
  $('#rv-card').classList.add('flipped');
  $('#rv-show').hidden = true;
  const labels = previews(current.srs);
  $('#rv-grades').replaceChildren(
    ...GRADES.map((g, i) =>
      h('button.grade.g' + g.grade, { onclick: () => grade(g.grade) }, h('b', null, g.label), h('span', null, labels[i]))
    )
  );
  $('#rv-grades').hidden = false;
}

async function grade(g) {
  if (!current) return;
  const card = current;
  if (card.srs.state === 'new') flashcards.noteNewStudied();
  card.srs = schedule(card.srs, g);
  reviewedThisSession++;
  current = null;
  await flashcards.save(card);
  next(card.id);
}
