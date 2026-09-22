/**
 * A repo changes level over time, not in one frame.
 *
 * Going quiet, a repo's contents fall into it: the children stay in the
 * simulation, drawn on their way to the parent and fading as they arrive, so
 * the old level stays in play until the collapse finishes. Coming back, the
 * new level is simulated at once so the children exist to burst outward
 * from the parent's position.
 *
 * Reversing mid-flight only undoes the distance covered, so a repo touched
 * a fifth of the way into a collapse reopens in a fifth of the time. A full
 * second to travel back a short way would look wrong.
 *
 * Timing is all this does. Where the bodies go is the layout's business.
 */

const DEFAULT_DURATION = 900;

/** @param {{ durationMs?: number }} [options] */
export function createLodTransitions({ durationMs = DEFAULT_DURATION } = {}) {
  /** @type {Map<string, any>} */
  const repos = new Map();

  return {
    /**
     * @param {Record<string, number>} levels the level each repo should be at
     * @param {number} now
     */
    update(levels, now) {
      for (const [repo, target] of Object.entries(levels)) {
        const state = repos.get(repo);

        if (!state) {
          // First sighting: a repo appears at its level rather than growing
          // into it, since there is no earlier level to come from.
          repos.set(repo, {
            phase: 'steady',
            level: target,
            from: target,
            to: target,
            progress: 1,
          });
          continue;
        }

        const settled = state.phase === 'steady' ? state.level : state.to;
        if (target === settled) {
          if (state.phase !== 'steady') advance(state, now, durationMs);
          continue;
        }

        // Turning around: the distance already travelled is the distance to
        // come back, so a repo touched a fifth of the way into a collapse
        // takes a fifth of the duration to reopen.
        const travelled = state.phase === 'steady' ? 1 : Math.max(0.05, state.progress);
        const phase = target > settled ? 'expanding' : 'collapsing';

        repos.set(repo, {
          phase,
          from: settled,
          to: target,
          startedAt: now,
          // Expanding simulates the destination so the children exist;
          // collapsing keeps the old level so there is something to pull in.
          level: phase === 'expanding' ? target : settled,
          progress: 0,
          scale: travelled,
        });
      }

      for (const repo of [...repos.keys()]) {
        if (!(repo in levels)) repos.delete(repo);
        else if (repos.get(repo).phase !== 'steady') advance(repos.get(repo), now, durationMs);
      }
    },

    /** @param {string} repo */
    stateFor(repo) {
      return repos.get(repo) ?? null;
    },

    /** The repos mid-transition, so the layout can skip the rest. */
    moving() {
      return [...repos.entries()].filter(([, s]) => s.phase !== 'steady').map(([repo]) => repo);
    },
  };
}

function advance(state, now, durationMs) {
  const span = durationMs * (state.scale ?? 1);
  const elapsed = now - state.startedAt;
  state.progress = span <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / span));

  if (state.progress >= 1) {
    state.phase = 'steady';
    state.level = state.to;
    state.from = state.to;
  }
}
