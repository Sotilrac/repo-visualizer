/**
 * The people, drawn on the graph.
 *
 * An actor is one contributor. They are pulled towards whatever they are
 * working on, hardest towards the files they still have a beam flying at,
 * and pushed off each other and off every bubble on screen. Someone who
 * stops committing fades and is recycled.
 *
 * It is a physics simulation, not a set of position adjustments: d3-force
 * integrates velocity Verlet over the same forces the bodies use, so the
 * people move under the same rules as the graph they stand on and settle
 * by losing speed rather than by being told to stop. What the forces cannot
 * promise, that two faces never overlap and that nobody is ever drawn on
 * top of a bubble, is imposed afterwards as a constraint on position.
 *
 * This module owns only the arithmetic. Loading avatars and drawing is the
 * renderer's job, which keeps the behaviour testable without a canvas.
 */

import { forceCollide, forceSimulation } from 'd3-force';
import { tileHue } from '../shared/avatarTile.js';
import { createGrid } from './grid.js';

/** How big a face is drawn, in world units. The renderer draws to this. */
export const AVATAR_RADIUS = 14;

/**
 * How much room a face takes up, which is wider than the face: there is a
 * ring around it and a halo around that.
 */
export const AVATAR_FOOTPRINT = AVATAR_RADIUS + 2;

/** Clear space left between two faces, so they never look joined. */
const AVATAR_GAP = 8;

/** And between a face and any bubble, so it never sits on a centre dot. */
const BUBBLE_GAP = 4;

/** How far out a bubble is felt before it is actually in the way. */
const BUBBLE_REACH = 26;

/**
 * How many times the constraints are relaxed each step.
 *
 * Pulling one pair of faces apart pushes one of them into a third, so a
 * pile needs several rounds before every pair is clear at once.
 */
const PROJECT_PASSES = 16;

const DEFAULTS = {
  /** How long a beam takes to travel, in milliseconds. */
  beamMs: 700,
  /** How long an actor lasts once its author stops committing. */
  idleMs: 14000,
  /** The share of that time it stays at full strength before fading. */
  holdFraction: 0.5,
  /** Beyond this many at once the graph is unreadable, so the quietest go. */
  maxActors: 40,
  /** How hard the work pulls, as a fraction of the distance per step. */
  aim: 0.02,
  /**
   * How much harder it pulls towards a file the actor has a beam flying at.
   *
   * Someone who has just committed is on their way in; someone whose beams
   * landed a while ago is standing about near their work. Both are the same
   * force with a different weight on it.
   */
  aimPending: 3,
  /** How fast the pull towards a file fades once it is no longer touched. */
  aimDecay: 0.994,
  /** Below this an old target is forgotten. */
  aimFloor: 0.05,
  /** The most files one person is pulled towards at once. */
  maxAims: 16,
  /** How far two actors prefer to stay apart. */
  actorClearance: 242,
  /** How hard they push each other where they would touch. */
  crowding: 1,
  /**
   * How steeply that push falls off with distance.
   *
   * A push that is the same at arm's length as at contact either shoves
   * people apart who are only near each other, or lets faces pile up. Cubed
   * means it is almost nothing across the room and immovable up close.
   */
  crowdFalloff: 3,
  /** The most one push may add to a speed in one step. */
  crowdCap: 6,
  /**
   * How close two faces may ever get, centre to centre. Measured on what is
   * drawn, halo and all, with a gap left between them.
   */
  minSeparation: AVATAR_FOOTPRINT * 2 + AVATAR_GAP,
  /** How far outside a repo's blob an actor stands to fire into it. */
  blobClearance: 144,
  /** How firmly the blob pushes back. */
  blobSeparation: 0.05,
  /** How firmly a single bubble pushes back. */
  separation: 0.12,
  /**
   * How much speed is lost each step.
   *
   * This is what makes them settle. A lightly damped actor circles its work
   * for as long as it is on screen, which is what used to need a rule that
   * stopped moving them after a while.
   */
  damping: 0.45,
  /**
   * Below this speed an actor is put to rest, in world units per step.
   *
   * Damping approaches nought without reaching it, so without a floor a
   * face that has finished moving still creeps by a fraction of a pixel
   * every frame, for as long as it is on screen. Physics engines call this
   * sleeping and every one of them has it.
   */
  sleepSpeed: 0.02,
  /** How far from the work a new actor appears, so the approach is visible. */
  entryOffset: 90,
};

/**
 * Hold every actor outside every bubble and off every other actor.
 *
 * The forces make them behave; this makes them legal. Several passes,
 * because moving someone out of one bubble can put them inside the next.
 *
 * @param {any[]} people
 * @param {{ bubblesNear: (x: number, y: number, reach: number, visit: (b: any) => void) => void }} world
 * @param {number} min how close two faces may get
 * @param {'x' | 'sx'} xk
 * @param {'y' | 'sy'} yk
 */
function project(people, world, min, xk, yk) {
  for (let pass = 0; pass < PROJECT_PASSES; pass++) {
    let moved = false;

    for (const person of people) {
      world.bubblesNear(person[xk], person[yk], AVATAR_FOOTPRINT + BUBBLE_GAP, (bubble) => {
        const need = (bubble.r ?? 0) + AVATAR_FOOTPRINT + BUBBLE_GAP;
        let dx = person[xk] - bubble.x;
        let dy = person[yk] - bubble.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= need) return;
        if (distance < 1e-6) {
          // Dead centre has no direction to leave along, so pick one.
          dx = 1;
          dy = 0;
          distance = 1e-6;
        }
        moved = true;
        person[xk] = bubble.x + (dx / distance) * need;
        person[yk] = bubble.y + (dy / distance) * need;
        // And stop carrying the speed that took them in there.
        if (xk === 'x' && person.vx != null) {
          const into = (person.vx * dx + person.vy * dy) / distance;
          if (into < 0) {
            person.vx -= (into * dx) / distance;
            person.vy -= (into * dy) / distance;
          }
        }
      });
    }

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

        moved = true;
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

    if (!moved) return;
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
  /** The same actors as an array, which is what the simulation holds. */
  let people = [];
  /** @type {any[]} */
  let beams = [];
  /** @type {Array<{ x: number, y: number, radius: number }>} */
  let blobs = [];
  const grid = createGrid(160);

  /** Every bubble near a point: the ones on screen, plus this actor's own. */
  function bubblesNear(x, y, reach, visit) {
    grid.near(x, y, reach, visit);
  }

  /** Where an actor is pulled, and how hard. */
  function aimOf(actor) {
    if (!actor.aims?.size) return null;
    let wx = 0;
    let wy = 0;
    let total = 0;
    let pending = 0;
    for (const entry of actor.aims.values()) {
      const weight = entry.weight * (entry.pending ? config.aimPending : 1);
      wx += entry.node.x * weight;
      wy += entry.node.y * weight;
      total += weight;
      if (entry.pending) pending += weight;
    }
    if (total <= 0) return null;
    const share = pending / total;
    return {
      x: wx / total,
      y: wy / total,
      pull: config.aim * (1 + (config.aimPending - 1) * share),
    };
  }

  /** Pull each actor towards its work. */
  function forceAim() {
    /** @type {any[]} */
    let nodes = [];
    const force = () => {
      for (const actor of nodes) {
        const aim = aimOf(actor);
        if (!aim) continue;
        actor.vx += (aim.x - actor.x) * aim.pull;
        actor.vy += (aim.y - actor.y) * aim.pull;
      }
    };
    force.initialize = (next) => {
      nodes = next;
    };
    return force;
  }

  /**
   * Push each actor out of the repo blobs and off the bubbles.
   *
   * The pull above aims at the middle of the work, which is inside the
   * repo; without this an avatar sits on top of the files it is firing at.
   */
  function forceClear() {
    /** @type {any[]} */
    let nodes = [];
    const away = (actor, x, y, need, strength) => {
      const dx = actor.x - x;
      const dy = actor.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance >= need) return;
      if (distance < 1e-6) {
        actor.vx += need * strength;
        return;
      }
      const shove = ((need - distance) / distance) * strength;
      actor.vx += dx * shove;
      actor.vy += dy * shove;
    };

    const force = () => {
      for (const actor of nodes) {
        for (const blob of blobs) {
          away(actor, blob.x, blob.y, blob.radius + config.blobClearance, config.blobSeparation);
        }
        const reach = AVATAR_FOOTPRINT + BUBBLE_GAP + BUBBLE_REACH;
        bubblesNear(actor.x, actor.y, reach, (bubble) => {
          away(actor, bubble.x, bubble.y, (bubble.r ?? 0) + reach, config.separation);
        });
      }
    };
    force.initialize = (next) => {
      nodes = next;
    };
    return force;
  }

  /**
   * Push each pair of actors apart, hard when they are nearly touching and
   * barely at all when they are not.
   */
  function forceSpace() {
    /** @type {any[]} */
    let nodes = [];
    const force = () => {
      const range = config.actorClearance;
      const floor = config.minSeparation;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          if (distance >= range) continue;
          if (distance < 1e-6) {
            dx = 1;
            dy = 0;
            distance = 1e-6;
          }
          // 0 at the far edge of the range, 1 where they would touch.
          const closeness = Math.min(1, (range - distance) / Math.max(1, range - floor));
          const shove =
            Math.min(
              config.crowdCap,
              config.crowding * closeness ** config.crowdFalloff * (range - distance),
            ) /
            distance /
            2;
          a.vx -= dx * shove;
          a.vy -= dy * shove;
          b.vx += dx * shove;
          b.vy += dy * shove;
        }
      }
    };
    force.initialize = (next) => {
      nodes = next;
    };
    return force;
  }

  /**
   * Put to rest anyone who has all but stopped.
   *
   * Runs after every other force and before the step is integrated, so an
   * actor whose forces have come into balance stays exactly where it is
   * instead of creeping a fraction of a pixel a frame forever.
   */
  function forceSleep() {
    /** @type {any[]} */
    let nodes = [];
    const force = () => {
      for (const actor of nodes) {
        if (Math.hypot(actor.vx, actor.vy) >= config.sleepSpeed) continue;
        actor.vx = 0;
        actor.vy = 0;
      }
    };
    force.initialize = (next) => {
      nodes = next;
    };
    return force;
  }

  const sim = forceSimulation(people)
    .force('aim', forceAim())
    .force('clear', forceClear())
    .force('space', forceSpace())
    .force(
      'touch',
      forceCollide(config.minSeparation / 2)
        .strength(1)
        .iterations(3),
    )
    .force('sleep', forceSleep())
    .velocityDecay(config.damping)
    .alpha(1)
    .alphaTarget(1)
    .alphaDecay(0);
  // d3 runs its own animation frame timer, and this simulation is stepped
  // by the frame loop at a fixed rate. Left running, both would step it.
  sim.stop();

  /** What the actors have to stay clear of: their own work and the graph. */
  function rebuildGrid() {
    /** @type {Map<any, any>} */
    const bubbles = new Map();
    for (const bubble of bodies) bubbles.set(bubble, bubble);
    for (const actor of people) {
      for (const entry of actor.aims?.values() ?? []) bubbles.set(entry.node, entry.node);
    }
    grid.build(bubbles.values());
  }

  /** @type {any[]} */
  let bodies = [];

  function members() {
    people = [...actors.values()];
    sim.nodes(people);
  }

  const world = { bubblesNear };

  function stepOnce() {
    for (const actor of people) {
      actor.px = actor.x;
      actor.py = actor.y;
      for (const [path, entry] of actor.aims ?? []) {
        entry.weight *= config.aimDecay;
        // The last one is kept however stale. Dropping it leaves nobody
        // holding the actor anywhere, and it drifts off whatever pushed it
        // last instead of standing by the work it was doing.
        if (entry.weight < config.aimFloor && actor.aims.size > 1) actor.aims.delete(path);
      }
    }
    rebuildGrid();
    sim.tick();
    project(people, world, config.minSeparation, 'x', 'y');
    // Where they are drawn, until the frame loop says how far into the next
    // step it is. Without this a caller that never interpolates draws
    // everyone wherever they first appeared.
    for (const actor of people) {
      actor.sx = actor.x;
      actor.sy = actor.y;
    }
  }

  return {
    list: () => people,
    beams: () => beams,
    get minSeparation() {
      return config.minSeparation;
    },

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
     *   avatarDamping?: number,
     * }} next
     */
    setTuning(next) {
      if (Number.isFinite(next.standoff)) config.blobClearance = Number(next.standoff);
      if (Number.isFinite(next.avatarSpacing)) config.actorClearance = Number(next.avatarSpacing);
      if (Number.isFinite(next.avatarDamping)) {
        config.damping = Math.min(0.95, Math.max(0.05, Number(next.avatarDamping)));
        sim.velocityDecay(config.damping);
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

    /**
     * Every bubble on screen, which is what nobody may be drawn on top of.
     *
     * @param {Iterable<{ x: number, y: number, r?: number }>} next
     */
    setBodies(next) {
      bodies = [...next];
    },

    clear() {
      actors.clear();
      beams = [];
      members();
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
          px: entryX,
          py: entryY,
          sx: entryX,
          sy: entryY,
          vx: 0,
          vy: 0,
          alpha: 1,
          commits: 0,
          idleFor: 0,
          aims: new Map(),
        };
        actors.set(key, actor);
        members();
      }

      actor.name = person.name;
      actor.avatar = person.avatar;
      for (const target of targets) {
        actor.aims.set(target.path, { node: target.node, weight: 1, pending: true });
      }
      // Only so many at once: a team drawn as one avatar touches everything,
      // and being pulled at every file it ever saw leaves it in the middle.
      if (actor.aims.size > config.maxAims) {
        const ranked = [...actor.aims.entries()].sort((a, b) => a[1].weight - b[1].weight);
        for (const [path] of ranked.slice(0, actor.aims.size - config.maxAims)) {
          actor.aims.delete(path);
        }
      }
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
        members();
      }
    },

    /**
     * Advance the people.
     *
     * @param {number} dt milliseconds since the last frame, which is what
     *   the beams and the fading run on
     * @param {number} [steps] simulation steps to run, from the step clock
     * @returns {string[]} the files any beam reached
     */
    tick(dt, steps = 1) {
      for (let step = 0; step < steps; step++) stepOnce();

      for (const actor of people) {
        actor.idleFor += dt;
        // Full strength for a while, then a fade. Dimming from the instant
        // of a commit makes someone who is actively working look like they
        // are leaving.
        const hold = config.idleMs * config.holdFraction;
        const fading = Math.max(0, actor.idleFor - hold) / Math.max(1, config.idleMs - hold);
        actor.alpha = Math.max(0, 1 - fading);
      }

      let gone = false;
      for (const [key, actor] of actors) {
        if (actor.idleFor >= config.idleMs) {
          actors.delete(key);
          gone = true;
        }
      }
      if (gone) members();

      /** @type {string[]} */
      const landed = [];
      const still = [];
      for (const beam of beams) {
        beam.age += dt;
        beam.progress = Math.min(1, beam.age / config.beamMs);
        if (beam.progress >= 1) {
          landed.push(beam.path);
          const aim = beam.from.aims?.get(beam.path);
          if (aim) aim.pending = false;
        } else if (actors.has(beam.key)) {
          still.push(beam);
        }
      }
      beams = still;

      return landed;
    },

    /**
     * Work out where everyone is drawn, part of the way between the last
     * simulation step and the one before it.
     *
     * The simulation runs at its own fixed rate and the screen refreshes at
     * another, so without this the people step along in time with the
     * simulation instead of moving smoothly.
     *
     * @param {number} alpha how far past the last step, 0 to 1
     */
    interpolate(alpha) {
      const t = Math.min(1, Math.max(0, alpha));
      for (const actor of people) {
        actor.sx = actor.px + (actor.x - actor.px) * t;
        actor.sy = actor.py + (actor.y - actor.py) * t;
      }
      // Two legal positions can interpolate to an illegal one, so what is
      // drawn is held to the same rules as what was simulated.
      project(people, world, config.minSeparation, 'sx', 'sy');
    },
  };
}
