/**
 * The people, drawn on the graph.
 *
 * An actor is one contributor. They drift toward whatever they are working
 * on and fire a beam at each file a commit touched; the beam triggers that
 * file's ripple when it lands, so the two effects stay in step. Someone who
 * stops committing fades and is recycled.
 *
 * This module owns only the arithmetic. Loading avatars and drawing is the
 * renderer's job, which keeps the behaviour testable without a canvas.
 */

import { tileHue } from '../shared/avatarTile.js';

const DEFAULTS = {
  /** How long a beam takes to travel, in milliseconds. */
  beamMs: 700,
  /** How long an actor lasts once its author stops committing. */
  idleMs: 14000,
  /** The share of that time it stays at full strength before fading. */
  holdFraction: 0.5,
  /** How hard an actor is pulled toward its work, per second. */
  spring: 3.2,
  /** Beyond this many at once the graph is unreadable, so the quietest go. */
  maxActors: 40,
  /** How far an actor stays off the bubbles it is working on. */
  nodeClearance: 30,
  /** How far two actors stay apart. */
  actorClearance: 38,
  /** How far outside a repo's blob an actor stands to fire into it. */
  blobClearance: 26,
  /**
   * How hard the blob pushes back. Firmer than the rest: the spring is
   * pulling the avatar towards the middle of the work the whole time, and a
   * soft push settles inside the blob rather than outside it.
   */
  blobSeparation: 0.9,
  /** How firmly they push. Soft, so people working together stay a cluster. */
  separation: 0.35,
  /** How far from the work a new actor appears, so the approach is visible. */
  entryOffset: 90,
};

/**
 * Move `subject` directly away from `other` until they are `clearance` apart.
 *
 * A fraction of the way each frame, so a crowd spreads out over several
 * frames and comes to rest. Moving the whole distance at once snaps.
 */
function push(subject, other, clearance, strength) {
  let dx = subject.x - other.x;
  let dy = subject.y - other.y;
  let distance = Math.hypot(dx, dy);

  // Exactly on top of each other has no direction to escape along, so pick one.
  if (distance < 1e-6) {
    dx = 1;
    dy = 0;
    distance = 1e-6;
  }
  if (distance >= clearance) return;

  const shift = ((clearance - distance) / distance) * strength;
  subject.x += dx * shift;
  subject.y += dy * shift;
}

/**
 * @param {Partial<typeof DEFAULTS> & {
 *   resolve?: (commit: any) => { key: string, name: string, hue?: number, avatar?: string } | null,
 * }} [options] `resolve` maps a commit's author to a person; returning null
 *   leaves them off the graph. Without it every address is its own actor.
 */
export function createActors(options = {}) {
  const config = { ...DEFAULTS, ...options };
  /** @type {(commit: any) => { key: string, name: string, hue?: number, avatar?: string } | null} */
  let resolve =
    options.resolve ??
    ((commit) => ({
      key: String(commit.authorEmail || commit.author || 'unknown').toLowerCase(),
      name: commit.author ?? 'unknown',
    }));
  /** @type {Map<string, any>} */
  const actors = new Map();
  /** @type {any[]} */
  let beams = [];
  /** @type {Array<{ x: number, y: number, radius: number }>} */
  let blobs = [];

  return {
    list: () => [...actors.values()],
    beams: () => beams,

    /** @param {(commit: any) => any} next */
    setResolver(next) {
      resolve = next;
    },

    /**
     * Settings changed while the graph is running.
     *
     * @param {{ standoff?: number, avatarLinger?: number }} next
     */
    setTuning(next) {
      if (Number.isFinite(next.standoff)) config.blobClearance = Number(next.standoff);
      if (Number.isFinite(next.avatarLinger)) {
        config.idleMs = Math.max(500, Number(next.avatarLinger) * 1000);
      }
    },

    /**
     * The repo blobs to stay out of, so a beam is fired from outside the
     * work rather than from the middle of it.
     *
     * @param {Iterable<{ x: number, y: number, radius: number }>} centers
     */
    setClusters(centers) {
      blobs = [...centers];
    },

    clear() {
      actors.clear();
      beams = [];
    },

    /**
     * @param {{ author?: string, authorEmail?: string, changes?: any[] }} commit
     * @param {Record<string, { x: number, y: number, r?: number }>} nodesByPath
     *   the current position of each file; a file with no node is off screen
     * @param {number} at a monotonic time, only used to order arrivals
     */
    onCommit(commit, nodesByPath, at) {
      const targets = (commit.changes ?? [])
        .map((change) => ({ path: change.path, node: nodesByPath[change.path] }))
        .filter((target) => target.node);
      if (targets.length === 0) return;

      const person = resolve(commit);
      if (!person) return;

      const key = person.key;
      const centre = {
        x: targets.reduce((sum, t) => sum + t.node.x, 0) / targets.length,
        y: targets.reduce((sum, t) => sum + t.node.y, 0) / targets.length,
      };

      let actor = actors.get(key);
      if (!actor) {
        // Arrive off to one side of the work, so the approach reads as motion.
        actor = {
          key,
          name: person.name,
          avatar: person.avatar,
          hue: person.hue ?? tileHue(key),
          x: centre.x + config.entryOffset,
          y: centre.y - config.entryOffset,
          alpha: 1,
          commits: 0,
          idleFor: 0,
        };
        actors.set(key, actor);
      }

      actor.name = person.name;
      actor.avatar = person.avatar;
      actor.target = centre;
      actor.nodes = targets.map((target) => target.node);
      actor.idleFor = 0;
      actor.alpha = 1;
      actor.commits += 1;
      actor.lastAt = at;

      for (const target of targets) {
        beams.push({
          key,
          path: target.path,
          from: actor,
          to: target.node,
          progress: 0,
          age: 0,
        });
      }

      // Drop the quietest once the crowd is unreadable.
      if (actors.size > config.maxActors) {
        const ranked = [...actors.values()].sort((a, b) => b.commits - a.commits);
        for (const spare of ranked.slice(config.maxActors)) actors.delete(spare.key);
        beams = beams.filter((beam) => actors.has(beam.key));
      }
    },

    /**
     * Advance everything by `dt` milliseconds.
     *
     * @param {number} dt
     * @returns {string[]} the files any beam reached on this frame
     */
    tick(dt) {
      const seconds = dt / 1000;

      const everyone = [...actors.values()];

      for (const actor of everyone) {
        if (actor.target) {
          const pull = Math.min(1, config.spring * seconds);
          actor.x += (actor.target.x - actor.x) * pull;
          actor.y += (actor.target.y - actor.y) * pull;
        }

        // Outside the repo it is working on. The target is in the middle of
        // the files it touched, which is inside the blob, so without this
        // the avatar sits on top of the bubbles it is firing at.
        for (const blob of blobs) {
          push(actor, blob, blob.radius + config.blobClearance, config.blobSeparation);
        }

        // And off the bubbles themselves, for a repo drawn at file level
        // where there is no blob worth the name.
        for (const target of actor.nodes ?? []) {
          push(actor, target, config.nodeClearance + (target.r ?? 0), config.separation);
        }

        actor.idleFor += dt;
        // Full strength for a while, then a fade. Dimming from the instant of
        // a commit makes someone who is actively working look like they are
        // leaving.
        const hold = config.idleMs * config.holdFraction;
        const fading = Math.max(0, actor.idleFor - hold) / Math.max(1, config.idleMs - hold);
        actor.alpha = Math.max(0, 1 - fading);
      }

      // And off each other. Soft on purpose: people working on the same files
      // should still read as a group.
      for (let i = 0; i < everyone.length; i++) {
        for (let j = i + 1; j < everyone.length; j++) {
          const a = everyone[i];
          const b = everyone[j];
          push(a, b, config.actorClearance, config.separation / 2);
          push(b, a, config.actorClearance, config.separation / 2);
        }
      }

      for (const [key, actor] of actors) {
        if (actor.idleFor >= config.idleMs) actors.delete(key);
      }

      /** @type {string[]} */
      const landed = [];
      const still = [];
      for (const beam of beams) {
        beam.age += dt;
        beam.progress = Math.min(1, beam.age / config.beamMs);
        if (beam.progress >= 1) landed.push(beam.path);
        else if (actors.has(beam.key)) still.push(beam);
      }
      beams = still;

      return landed;
    },
  };
}
