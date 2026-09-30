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

/** How big a face is drawn, in world units. The renderer draws to this. */
export const AVATAR_RADIUS = 14;

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
  /** How far two actors prefer to stay apart. */
  actorClearance: 46,
  /**
   * How close two faces may ever get, centre to centre.
   *
   * The preference above is a push that balances against everything else
   * pulling them together, so it is a tendency rather than a rule. Two
   * faces drawn on top of each other are unreadable whatever the forces
   * wanted, so this one is imposed afterwards, on the drawn position.
   */
  minSeparation: AVATAR_RADIUS * 2,
  /** How far outside a repo's blob an actor stands to fire into it. */
  blobClearance: 64,
  /**
   * The time constant of the filter on the drawn position, in milliseconds.
   *
   * A spring, two repulsions and a target that moves with every commit add
   * up to a position that twitches frame to frame. The forces stay as they
   * are and what is drawn lags them, which is the difference between a
   * person moving and a person flickering.
   */
  smoothingMs: 260,
  /**
   * Movement below this is not worth drawing. Three forces balancing each
   * other leave a face creeping around its resting place forever, and a
   * picture that never quite stops is what reads as unstable.
   */
  stillness: 0.35,
  /**
   * How long after their last commit someone stops being moved about.
   *
   * The spring towards their work and the pushes off the bubbles and off
   * each other balance at a point they circle rather than reach, so an
   * avatar with nothing to do drifts for as long as it is on screen. Long
   * enough to reach their work first, and then they stop; a new commit
   * sets them going again.
   */
  restAfterMs: 1500,
  /**
   * How hard the blob pushes back. Firmer than the rest: the spring is
   * pulling the avatar towards the middle of the work the whole time, and a
   * soft push settles inside the blob rather than outside it.
   */
  blobSeparation: 0.9,
  /** How firmly they push off the bubbles they are working on. */
  separation: 0.35,
  /**
   * How firmly they push off each other. Firmer than the bubbles, since
   * they are all held against the same blob edge and a soft push there
   * leaves a stack of faces nobody can read. Each of a pair moves a quarter
   * of the way, so the two together close half the gap per frame and
   * converge instead of batting each other back and forth.
   */
  crowding: 0.18,
  /** How far from the work a new actor appears, so the approach is visible. */
  entryOffset: 90,
  /**
   * How much of the way a commit moves where someone is heading.
   *
   * A person usually commits to the same corner twice running and this
   * changes nothing. A whole team drawn as one avatar is the case it is
   * for: its commits come from everywhere, and aiming at the latest one
   * sends it across the graph and back several times a second.
   */
  targetBlend: 0.3,
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
 * Pull apart any pair closer than `min`, half the overlap each.
 *
 * Several passes, because moving one pair apart can push one of them into
 * a third, and it stops as soon as a pass finds nothing left to do.
 *
 * @param {any[]} people
 * @param {number} min
 * @param {'x' | 'sx'} xk
 * @param {'y' | 'sy'} yk
 */
function separate(people, min, xk, yk) {
  for (let pass = 0; pass < 4; pass++) {
    let touched = false;
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i];
        const b = people[j];
        let dx = b[xk] - a[xk];
        let dy = b[yk] - a[yk];
        let distance = Math.hypot(dx, dy);
        if (distance >= min) continue;

        // Exactly on top of each other has no direction to separate along,
        // so pick one from their order, which keeps a frame reproducible.
        if (distance < 1e-6) {
          const angle = (i * 2.399 + j) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        touched = true;
        // A little more than half the overlap each: a pile resolved by
        // exact halves converges towards the floor without reaching it, and
        // what is left is a row of faces just touching.
        const shift = ((min - distance) / 2 / distance) * 1.08;
        a[xk] -= dx * shift;
        a[yk] -= dy * shift;
        b[xk] += dx * shift;
        b[yk] += dy * shift;
      }
    }
    // A pass that finds no overlap means the rest would find none either.
    if (!touched) return;
  }
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
     * @param {{
     *   standoff?: number,
     *   avatarLinger?: number,
     *   avatarSpacing?: number,
     *   avatarSmoothing?: number,
     * }} next
     */
    setTuning(next) {
      if (Number.isFinite(next.standoff)) config.blobClearance = Number(next.standoff);
      if (Number.isFinite(next.avatarSpacing)) config.actorClearance = Number(next.avatarSpacing);
      if (Number.isFinite(next.avatarSmoothing)) {
        config.smoothingMs = Math.max(0, Number(next.avatarSmoothing));
      }
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
        // Arrive off to one side of the work, so the approach reads as
        // motion. Which side comes from their name, so a crowd arriving at
        // once comes from all around rather than from one point.
        const bearing = (tileHue(key) / 180) * Math.PI;
        const entryX = centre.x + Math.cos(bearing) * config.entryOffset;
        const entryY = centre.y + Math.sin(bearing) * config.entryOffset;
        actor = {
          key,
          name: person.name,
          avatar: person.avatar,
          hue: person.hue ?? tileHue(key),
          x: entryX,
          y: entryY,
          sx: entryX,
          sy: entryY,
          alpha: 1,
          commits: 0,
          idleFor: 0,
        };
        actors.set(key, actor);
      }

      actor.name = person.name;
      actor.avatar = person.avatar;
      actor.target = actor.target
        ? {
            x: actor.target.x + (centre.x - actor.target.x) * config.targetBlend,
            y: actor.target.y + (centre.y - actor.target.y) * config.targetBlend,
          }
        : centre;
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
        // Nothing to move towards and nothing pushing: they have arrived.
        if (actor.idleFor > config.restAfterMs) {
          actor.idleFor += dt;
          const hold = config.idleMs * config.holdFraction;
          const fading = Math.max(0, actor.idleFor - hold) / Math.max(1, config.idleMs - hold);
          actor.alpha = Math.max(0, 1 - fading);
          continue;
        }

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
      // should still read as a group. Only those still in motion: pushing a
      // pair that has come to rest starts them moving again.
      const moving = everyone.filter((actor) => actor.idleFor <= config.restAfterMs);
      for (const a of moving) {
        for (const b of everyone) {
          if (a === b) continue;
          push(a, b, config.actorClearance, config.crowding);
        }
      }

      // What is drawn follows where the forces put them, a fixed fraction
      // of the remaining distance each frame. The fraction comes from the
      // frame time, so the motion is the same whatever the frame rate.
      const follow = config.smoothingMs > 0 ? 1 - Math.exp(-dt / config.smoothingMs) : 1;
      for (const actor of everyone) {
        const dx = actor.x - actor.sx;
        const dy = actor.y - actor.sy;
        if (Math.hypot(dx, dy) < config.stillness) continue;
        actor.sx += dx * follow;
        actor.sy += dy * follow;
      }

      // Never overlapping, whatever the forces and the filter worked out
      // between them. Both positions: the raw one so the next frame starts
      // from somewhere legal, the drawn one because that is what is seen.
      separate(everyone, config.minSeparation, 'x', 'y');
      separate(everyone, config.minSeparation, 'sx', 'sy');

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
