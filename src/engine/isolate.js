/**
 * Who belongs in the picture when one part of the graph is picked out.
 *
 * Isolating a repo is a way of reading it on its own. Leaving everyone who
 * happens to be on screen standing around it, firing at bubbles that have
 * been dimmed to nothing, puts back most of what isolating was meant to
 * take away.
 */

/**
 * The people whose work is inside the picked-out part.
 *
 * @param {Array<{ aims?: Map<string, { node: any }> }>} actors
 * @param {(node: any) => boolean} inFocus
 */
export function actorsOn(actors, inFocus) {
  return actors.filter((actor) => {
    for (const aim of actor.aims?.values() ?? []) {
      if (inFocus(aim.node)) return true;
    }
    return false;
  });
}
