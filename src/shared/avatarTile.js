/**
 * The generated avatar: initials on a coloured disc.
 *
 * Shared, because both sides draw it. The scan writes one to disk for anyone
 * with no gravatar, and the visualization draws one for an author it has no
 * image for, and the two have to be the same face and the same colour.
 */

/** @param {string} name */
export function initialsFor(name) {
  const words = name.split(/[\s_-]+/).filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return '?';
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return (first + last).toUpperCase();
}

/**
 * A hue derived from the person's id with FNV-1a.
 *
 * From the id, so renaming someone keeps their colour, and from a hash, so
 * it does not shift when the number of people changes.
 *
 * @param {string} id
 */
export function tileHue(id) {
  let hash = 0x811c9dc5;
  for (const char of id) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** @param {string} text */
function escapeXml(text) {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * The generated fallback tile: initials on a flat disc.
 *
 * SVG, so it needs no image library and stays crisp at any size the
 * renderer draws it.
 *
 * @param {string} name
 * @param {string} id
 * @param {{ size?: number }} [options]
 */
export function initialsSvg(name, id, { size = 256 } = {}) {
  const hue = tileHue(id);
  const initials = escapeXml(initialsFor(name));
  const fontSize = initials.length > 1 ? size * 0.36 : size * 0.46;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="hsl(${hue} 52% 42%)"/>`,
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle"`,
    ` font-family="Inter, system-ui, sans-serif" font-weight="600"`,
    ` font-size="${Math.round(fontSize)}" fill="hsl(${hue} 60% 94%)">${initials}</text>`,
    '</svg>',
  ].join('');
}
