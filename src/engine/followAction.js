/**
 * What the camera looks at when it is following the action.
 *
 * Fitting the whole graph keeps everything in view and, six years and a
 * hundred repos in, makes every bubble too small to read. Following the
 * action frames only what is being worked on: the bodies a commit has just
 * touched, whatever the people on screen are still aiming at, and the people
 * themselves, so a beam and both its ends stay in shot.
 */

import { AVATAR_RADIUS } from './actors.js';

/**
 * @param {{
 *   ripples?: Array<{ path: string }>,
 *   actors?: Array<{ x: number, y: number, sx?: number, sy?: number, aims?: Map<string, any> }>,
 *   nodeByPath?: Map<string, any>,
 * }} frame
 * @returns {Array<{ x: number, y: number, r?: number }>}
 */
export function activePoints({ ripples = [], actors = [], nodeByPath = new Map() }) {
  /** @type {Array<{ x: number, y: number, r?: number }>} */
  const points = [];
  const seen = new Set();

  const addBody = (body) => {
    if (!body || seen.has(body)) return;
    seen.add(body);
    points.push(body);
  };

  // Where a commit just landed, for as long as its ripple runs.
  for (const ripple of ripples) addBody(nodeByPath.get(ripple.path));

  for (const actor of actors) {
    // What they are still working on, which outlasts the ripple and is what
    // keeps the shot from cutting away the moment one lands.
    for (const aim of actor.aims?.values() ?? []) addBody(aim.node);
    points.push({ x: actor.sx ?? actor.x, y: actor.sy ?? actor.y, r: AVATAR_RADIUS });
  }

  return points;
}
