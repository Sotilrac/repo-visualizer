/**
 * When each repo was last touched, at any point on the timeline.
 *
 * Level of detail decays with real time, so the decay needs a date, and the
 * graph's own nodes only carry commit indices. The commit list has both, so
 * each repo gets the indices it appears at and the dates they happened on,
 * and a search over that answers the question at any playhead position.
 */

/**
 * @param {Array<{ repo?: string, date: string }>} commits in timeline order
 * @returns {Map<string, { at: number[], on: number[] }>}
 */
export function buildRepoClock(commits) {
  /** @type {Map<string, { at: number[], on: number[] }>} */
  const clock = new Map();

  commits.forEach((commit, index) => {
    if (!commit.repo) return;
    let entry = clock.get(commit.repo);
    if (!entry) {
      entry = { at: [], on: [] };
      clock.set(commit.repo, entry);
    }
    entry.at.push(index);
    entry.on.push(new Date(commit.date).getTime());
  });

  return clock;
}

/**
 * The date of the repo's last commit at or before `commitIndex`, or null
 * when the playhead has not reached one.
 *
 * @param {Map<string, { at: number[], on: number[] }>} clock
 * @param {string} repo
 * @param {number} commitIndex
 */
export function touchedAt(clock, repo, commitIndex) {
  const entry = clock.get(repo);
  if (!entry || commitIndex < 0) return null;

  let low = 0;
  let high = entry.at.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (entry.at[mid] <= commitIndex) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found < 0 ? null : entry.on[found];
}
