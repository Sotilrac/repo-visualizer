/**
 * A fixed field of stars behind everything.
 *
 * The same stars every run, so a recording made twice is the same
 * recording, and cheap enough to draw live that the twinkle stays.
 */

/** @param {number} [count] */
export function starfield(count = 380) {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand(),
      y: rand(),
      z: 0.2 + rand() * 0.8,
      r: 0.4 + rand() * 1.4,
      twinkle: rand() * Math.PI * 2,
    });
  }
  return stars;
}
