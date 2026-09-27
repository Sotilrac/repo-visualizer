/**
 * Where the calendar falls on the scrubber.
 *
 * The scrubber is linear in commits, not in time: a fortnight of heavy work
 * takes as much of the track as a quiet year. That is what makes the
 * playback even, and it also means a viewer cannot tell when anything
 * happened without marks. Each month boundary is placed at the commit that
 * crossed it, so the ticks bunch up where the work was.
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
 * @param {Array<{ date: string }>} commits in timeline order
 * @returns {Array<{ pct: number, kind: 'month' | 'half' | 'year', label?: string }>}
 */
export function timelineTicks(commits) {
  if (!commits || commits.length < 2) return [];

  const times = commits.map((commit) => new Date(commit.date).getTime());
  const first = times[0];
  const last = times[times.length - 1];
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
      pct: (indexAt(times, cursor.getTime()) / (times.length - 1)) * 100,
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
  const years = lastOfEachRun(
    ticks.filter((tick) => tick.kind === 'year'),
    MIN_GAP.year,
  );
  for (const tick of lastOfEachRun(years.filter((t) => t.label).reverse(), LABEL_GAP)) {
    tick.keepLabel = true;
  }
  for (const tick of years) {
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
 * From each run of marks closer together than `gap`, the last one.
 *
 * @param {any[]} ticks in order
 * @param {number} gap
 */
function lastOfEachRun(ticks, gap) {
  const kept = [];
  for (let i = 0; i < ticks.length; i++) {
    const next = ticks[i + 1];
    if (!next || Math.abs(next.pct - ticks[i].pct) >= gap) kept.push(ticks[i]);
  }
  return kept;
}

/** The first commit at or after `at`, by binary search over a sorted list. */
function indexAt(times, at) {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid] < at) low = mid + 1;
    else high = mid;
  }
  return low;
}
