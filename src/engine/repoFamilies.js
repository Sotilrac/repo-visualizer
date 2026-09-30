/**
 * Colour the repos by name, so a family reads as a family.
 *
 * Sixty repos spread evenly around the colour wheel gives every one a
 * different hue and tells you nothing: `flexsea-core` and `flexsea-dephy`
 * end up as unrelated as `flexsea-core` and `nexus`. Naming is how the
 * organisation already groups its work, so the colour follows it: every
 * `flexsea*` is a shade of one hue, every `talaria*` a shade of another.
 *
 * The family is the first word of the name, which is what a prefix is. The
 * shades inside it are a narrow band around the family's hue, so they are
 * still told apart at a glance without reading as different colours.
 */

/** How far apart two repos in the same family may be pushed, in degrees. */
const STEP = 7;
const BAND = 26;

/**
 * The first word of a name, which is the family it belongs to.
 *
 * Separators and capitals both start a word, so `flexsea-core`,
 * `flexsea_core` and `FlexSEACore` are all `flexsea`.
 *
 * @param {string} name
 */
export function familyOf(name) {
  const cleaned = String(name ?? '')
    .replace(/^~/, '')
    .trim();
  if (!cleaned) return '';

  const [first] = cleaned
    // A capital that starts a lowercase word is a break: dataWorks. A
    // capital followed by another capital is an acronym and is not, or
    // FlexSEA would come apart into Flex and SEA.
    .replace(/([a-z0-9])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return (first ?? cleaned).toLowerCase();
}

/**
 * Group names by family, each family keeping its names in the order given.
 *
 * @param {string[]} names
 * @returns {Map<string, string[]>}
 */
export function familiesOf(names) {
  /** @type {Map<string, string[]>} */
  const families = new Map();
  for (const name of names) {
    const family = familyOf(name);
    const members = families.get(family);
    if (members) members.push(name);
    else families.set(family, [name]);
  }
  return families;
}

/**
 * Where each name sits around a hue circle.
 *
 * `hueFor` places a family; this spreads the family's members around that
 * placement, centred on it so a family of one lands exactly on its hue.
 *
 * @param {string[]} names
 * @param {(family: string, index: number, total: number) => number} hueFor
 * @returns {Map<string, { hue: number, variant: number }>}
 */
export function familyHues(names, hueFor) {
  const families = familiesOf(names);
  /** @type {Map<string, { hue: number, variant: number }>} */
  const palette = new Map();

  let index = 0;
  const total = families.size;
  for (const [family, members] of families) {
    const base = hueFor(family, index, total);
    index++;

    // A wide family fans out no further than the band, so it never reaches
    // into its neighbour's colour.
    const spread = Math.min(BAND, STEP * (members.length - 1));
    const step = members.length > 1 ? spread / (members.length - 1) : 0;
    members.forEach((name, i) => {
      const hue = (base - spread / 2 + step * i + 360) % 360;
      palette.set(name, { hue: Math.round(hue * 10) / 10, variant: i % 5 });
    });
  }

  return palette;
}
