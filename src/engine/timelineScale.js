/**
 * The scrubber runs on the calendar, not on the commit count.
 *
 * Placing commits evenly along the track makes a fortnight of heavy work
 * take as much room as a quiet year, and a year mark can then land anywhere.
 * Placing them by date instead means a year is always the same width, at
 * the cost of the handle standing still through the quiet stretches, which
 * is the honest picture of a history that came in bursts.
 */

/**
 * @param {Array<{ date: string }>} commits in timeline order
 */
export function createTimeScale(commits) {
  const times = (commits ?? []).map((commit) => Date.parse(commit.date));
  const first = times[0] ?? 0;
  const last = times[times.length - 1] ?? 0;
  const span = last > first ? last - first : 1;

  return {
    first,
    last,
    span,

    /** Where a commit sits on the track, as a percentage. */
    pctOf(index) {
      if (!times.length || index < 0) return 0;
      const at = times[Math.min(times.length - 1, Math.max(0, index))];
      return ((at - first) / span) * 100;
    },

    /** Where a moment sits on the track. */
    pctAt(time) {
      return Math.max(0, Math.min(100, ((time - first) / span) * 100));
    },

    /**
     * The commit a point on the track lands on: the last one at or before
     * that moment, so dragging into a quiet gap holds the state the work
     * left behind rather than jumping ahead to the next burst.
     */
    indexAt(pct) {
      if (!times.length) return 0;
      const at = first + (Math.max(0, Math.min(100, pct)) / 100) * span;

      let low = 0;
      let high = times.length - 1;
      let found = 0;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (times[mid] <= at) {
          found = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return found;
    },
  };
}
