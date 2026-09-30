import { createTimeScale } from './timelineScale.js';

/**
 * Where the calendar falls on the scrubber.
 *
 * The track runs on the calendar, so a month is the same width wherever it
 * is and the year marks come at even intervals. What varies is how many
 * commits sit under each one.
 */

/**
 * How close two marks may get, as a share of the track.
 *
 * The months bunch wherever the work was, so on a busy stretch several land
 * on the same pixel. A year always earns its mark, a half year gives way to
 * a year, and a month gives way to either.
 */
const MIN_GAP = { month: 0.5, half: 0.25, year: 0.25 };

/** How much of the track a year label needs to itself. */
const LABEL_GAP = 3;

/**
 * And how much the date at the very start needs.
 *
 * More than a year needs, because it is a longer word: `Oct 20` against
 * `2021`.
 */
const START_GAP = 5;

/**
 * @param {Array<{ date: string }>} commits in timeline order
 * @returns {Array<{ pct: number, kind: 'month' | 'half' | 'year', label?: string }>}
 */
export function timelineTicks(commits) {
  if (!commits || commits.length < 2) return [];

  const scale = createTimeScale(commits);
  const { first, last } = scale;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return [];

  const start = new Date(first);
  const ticks = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  // The first boundary inside the window, since the month the history opens
  // in started before it.
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);

  while (cursor.getTime() <= last) {
    const month = cursor.getUTCMonth();
    const kind = month === 0 ? 'year' : month % 6 === 0 ? 'half' : 'month';

    ticks.push({
      pct: scale.pctAt(cursor.getTime()),
      kind,
      ...(kind === 'year' ? { label: String(cursor.getUTCFullYear()) } : {}),
    });

    cursor.setUTCMonth(month + 1);
  }

  return thin(ticks);
}

/**
 * Drop the marks that would land on top of another one.
 *
 * Where several fall together the last is the one kept, because everything
 * at that point on the track happened by then: a history that opens with a
 * few commits from years earlier stacks those years on the left edge, and
 * the mark that belongs there is the latest of them.
 *
 * @param {any[]} ticks
 */
function thin(ticks) {
  const years = spacedFromTheEnd(
    ticks.filter((tick) => tick.kind === 'year'),
    MIN_GAP.year,
  );
  for (const tick of spacedFromTheEnd(years, LABEL_GAP)) tick.keepLabel = true;
  for (const tick of years) {
    // The date the history opens on is marked at the very start of the
    // track, and a year landing a few weeks later writes over it.
    if (tick.pct < START_GAP) tick.keepLabel = undefined;
    if (!tick.keepLabel) tick.label = undefined;
    tick.keepLabel = undefined;
  }

  const kept = [...years];
  for (const kind of ['half', 'month']) {
    for (const tick of ticks.filter((t) => t.kind === kind)) {
      const clash = kept.some((other) => Math.abs(other.pct - tick.pct) < MIN_GAP[kind]);
      if (!clash) kept.push(tick);
    }
  }

  return kept.sort((a, b) => a.pct - b.pct);
}

/**
 * Marks at least `gap` apart, chosen from the end backwards.
 *
 * From the end because the last mark of a run is the one that belongs
 * there: a history opening with a few commits from years earlier stacks
 * those years on the left edge, and everything at that point happened by
 * the latest of them. It also keeps the most recent year named.
 *
 * @param {any[]} ticks in order
 * @param {number} gap
 */
function spacedFromTheEnd(ticks, gap) {
  const kept = [];
  let previous = null;
  for (let i = ticks.length - 1; i >= 0; i--) {
    if (previous === null || previous - ticks[i].pct >= gap) {
      kept.push(ticks[i]);
      previous = ticks[i].pct;
    }
  }
  return kept.reverse();
}
