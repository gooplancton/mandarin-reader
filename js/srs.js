/*
 * Spaced repetition scheduler, a small variant of SM-2 (the algorithm behind Anki).
 *
 * card.srs = { state: 'new' | 'learning' | 'review', due, interval (days), ease, step, reps, lapses }
 * Grades: 1 Again, 2 Hard, 3 Good, 4 Easy.
 */

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const LEARN_STEPS = [1 * MIN, 10 * MIN]; // new cards
const RELEARN_STEPS = [10 * MIN]; // forgotten review cards
const GRADUATE_DAYS = 1;
const EASY_DAYS = 4;
const START_EASE = 2.5;
const MIN_EASE = 1.3;
export const LEARN_AHEAD = 20 * MIN; // when nothing else is due, learning cards due this soon may be shown

export const GRADES = [
  { grade: 1, label: 'Again', key: '1' },
  { grade: 2, label: 'Hard', key: '2' },
  { grade: 3, label: 'Good', key: '3' },
  { grade: 4, label: 'Easy', key: '4' },
];

export function newSrs(now = Date.now()) {
  return { state: 'new', due: now, interval: 0, ease: START_EASE, step: 0, reps: 0, lapses: 0 };
}

/** Return the card's next srs state for a grade (pure). */
export function schedule(srs, grade, now = Date.now()) {
  const s = Object.assign(newSrs(now), srs);
  s.reps++;
  s.lastReview = now;

  if (s.state === 'new' || s.state === 'learning') {
    const steps = s.lapses && s.state === 'learning' && s.interval ? RELEARN_STEPS : LEARN_STEPS;
    if (grade === 1) {
      s.state = 'learning';
      s.step = 0;
      s.due = now + steps[0];
    } else if (grade === 2) {
      s.state = 'learning';
      const cur = steps[Math.min(s.step, steps.length - 1)];
      const next = steps[Math.min(s.step + 1, steps.length - 1)];
      s.due = now + Math.round((cur + next) / 2);
    } else if (grade === 3 && s.step + 1 < steps.length) {
      s.state = 'learning';
      s.step++;
      s.due = now + steps[s.step];
    } else {
      // graduate (Good on the last step, or Easy at any time)
      const relearning = s.interval > 0;
      let days;
      if (grade === 4) days = relearning ? Math.max(s.interval * 1.5, EASY_DAYS) : EASY_DAYS;
      else days = relearning ? s.interval : GRADUATE_DAYS;
      s.state = 'review';
      s.step = 0;
      s.interval = days;
      s.due = now + fuzz(days) * DAY;
    }
    return s;
  }

  // review card
  if (grade === 1) {
    s.lapses++;
    s.ease = Math.max(MIN_EASE, s.ease - 0.2);
    s.interval = Math.max(1, s.interval * 0.5); // used when it graduates from relearning
    s.state = 'learning';
    s.step = 0;
    s.due = now + RELEARN_STEPS[0];
    return s;
  }
  const overdueDays = Math.max(0, (now - s.due) / DAY);
  let interval;
  if (grade === 2) {
    interval = s.interval * 1.2;
    s.ease = Math.max(MIN_EASE, s.ease - 0.15);
  } else if (grade === 3) {
    interval = (s.interval + overdueDays / 2) * s.ease;
  } else {
    interval = (s.interval + overdueDays) * s.ease * 1.3;
    s.ease += 0.15;
  }
  s.interval = Math.max(s.interval + 1, interval);
  s.due = now + fuzz(s.interval) * DAY;
  return s;
}

/** Small random spread so cards added together don't stay bunched up forever. */
function fuzz(days) {
  if (days < 2.5) return days;
  const spread = Math.min(days * 0.05, 4);
  return days + (Math.random() * 2 - 1) * spread;
}

/** Human-friendly label for the time until `due`. */
export function formatInterval(ms) {
  if (ms < MIN) return 'now';
  if (ms < 60 * MIN) return Math.round(ms / MIN) + 'm';
  if (ms < 22 * 60 * MIN) return Math.round(ms / (60 * MIN)) + 'h';
  const d = ms / DAY;
  if (d < 30) return Math.round(d) + 'd';
  if (d < 365) return (d / 30).toFixed(d < 300 ? 1 : 0).replace(/\.0$/, '') + 'mo';
  return (d / 365).toFixed(1).replace(/\.0$/, '') + 'y';
}

/** Preview of the next interval for each grade (for button labels). */
export function previews(srs, now = Date.now()) {
  return GRADES.map((g) => {
    const s = schedule(srs, g.grade, now);
    return formatInterval(s.due - now);
  });
}

export function isDue(card, now = Date.now()) {
  return card.srs.state !== 'new' && card.srs.due <= now;
}

/**
 * Pick the next card to study, Anki-style:
 * due learning/review cards first, then new cards (within today's allowance),
 * then learning cards that will be due within LEARN_AHEAD.
 */
export function pickNext(cards, { newAllowance, now = Date.now(), exclude } = {}) {
  const avail = exclude ? cards.filter((c) => c.id !== exclude) : cards;
  const due = avail.filter((c) => isDue(c, now)).sort((a, b) => a.srs.due - b.srs.due);
  if (due.length) return due[0];
  if (newAllowance > 0) {
    const fresh = avail.filter((c) => c.srs.state === 'new').sort((a, b) => a.createdAt - b.createdAt);
    if (fresh.length) return fresh[0];
  }
  const soon = avail
    .filter((c) => c.srs.state === 'learning' && c.srs.due <= now + LEARN_AHEAD)
    .sort((a, b) => a.srs.due - b.srs.due);
  if (soon.length) return soon[0];
  // `exclude` is only a preference: if the excluded card is the only one left, still show it
  if (exclude) return pickNext(cards, { newAllowance, now });
  return null;
}

export function counts(cards, newAllowance, now = Date.now()) {
  const fresh = cards.filter((c) => c.srs.state === 'new').length;
  const learning = cards.filter((c) => c.srs.state === 'learning' && c.srs.due <= now + LEARN_AHEAD).length;
  const review = cards.filter((c) => c.srs.state === 'review' && c.srs.due <= now).length;
  const newToday = Math.min(fresh, Math.max(0, newAllowance));
  return { fresh, learning, review, newToday, total: cards.length, toStudy: learning + review + newToday };
}
