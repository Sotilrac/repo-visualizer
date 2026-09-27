/**
 * The knobs on the layout.
 *
 * Every constant in here was picked against one dataset, and the right
 * value depends on how many repos are on screen and how big they are. So
 * they are settings, adjustable while the graph is running, and kept in the
 * browser so a session survives a reload.
 */

const STORE_KEY = 'repo-viz:tuning';

/**
 * @typedef {{
 *   label: string,
 *   hint: string,
 *   group: string,
 *   value: number,
 *   min: number,
 *   max: number,
 *   step: number,
 * }} Knob
 */

/** @type {Record<string, Knob>} */
export const KNOBS = {
  clusterPull: {
    label: 'Repo pull',
    hint: 'How hard a bubble that has drifted outside its repo is pulled back',
    group: 'Repos',
    value: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
  },
  clusterRoom: {
    label: 'Repo room',
    hint: 'How much wider a repo is than the bubbles inside it',
    group: 'Repos',
    value: 1.45,
    min: 1,
    max: 3,
    step: 0.05,
  },
  clusterGap: {
    label: 'Repo spacing',
    hint: 'How much clear space is left between one repo and the next',
    group: 'Repos',
    value: 1.35,
    min: 1,
    max: 3,
    step: 0.05,
  },
  repel: {
    label: 'Repulsion',
    hint: 'How hard the bubbles push each other apart',
    group: 'Bubbles',
    value: 1,
    min: 0.2,
    max: 4,
    step: 0.1,
  },
  spacing: {
    label: 'Bubble spacing',
    hint: 'Clear space kept around each bubble',
    group: 'Bubbles',
    value: 10,
    min: 0,
    max: 30,
    step: 1,
  },
  repoSize: {
    label: 'Repo size',
    hint: 'How big a repo or folder bubble is drawn',
    group: 'Bubbles',
    value: 1,
    min: 0.4,
    max: 2,
    step: 0.05,
  },
  fileSize: {
    label: 'File size',
    hint: 'How big a single file is drawn',
    group: 'Bubbles',
    value: 1,
    min: 0.4,
    max: 2,
    step: 0.05,
  },
  linkDistance: {
    label: 'Import length',
    hint: 'How far apart an import holds the two things it connects',
    group: 'Imports',
    value: 52,
    min: 20,
    max: 240,
    step: 4,
  },
  linkPull: {
    label: 'Import pull',
    hint: 'How hard an import draws them together',
    group: 'Imports',
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
  },
  avatarLinger: {
    label: 'Avatar linger',
    hint: 'How long someone stays on the graph after their last commit, in seconds',
    group: 'People',
    value: 14,
    min: 2,
    max: 90,
    step: 1,
  },
  avatarSpacing: {
    label: 'Avatar spacing',
    hint: 'How far two people stay apart on the graph',
    group: 'People',
    value: 46,
    min: 0,
    max: 160,
    step: 2,
  },
  avatarSmoothing: {
    label: 'Avatar smoothing',
    hint: 'How much the drawn position lags the forces, in milliseconds',
    group: 'People',
    value: 170,
    min: 0,
    max: 600,
    step: 10,
  },
  standoff: {
    label: 'Avatar standoff',
    hint: 'How far outside a repo someone stands to fire at it',
    group: 'People',
    value: 64,
    min: 0,
    max: 200,
    step: 2,
  },
};

/** @type {Record<string, number>} */
export const DEFAULT_TUNING = Object.fromEntries(
  Object.entries(KNOBS).map(([key, knob]) => [key, knob.value]),
);

/** The groups in the order they are laid out, each with its knobs. */
export function knobGroups() {
  /** @type {Map<string, Array<{ key: string } & Knob>>} */
  const groups = new Map();
  for (const [key, knob] of Object.entries(KNOBS)) {
    if (!groups.has(knob.group)) groups.set(knob.group, []);
    groups.get(knob.group).push({ key, ...knob });
  }
  return [...groups.entries()];
}

/**
 * Fill in what is missing and drop what does not belong, so a stale setting
 * from an older version cannot put the layout somewhere it cannot recover
 * from.
 *
 * @param {Record<string, any> | null | undefined} values
 * @returns {Record<string, number>}
 */
export function withDefaults(values) {
  const out = { ...DEFAULT_TUNING };
  for (const [key, knob] of Object.entries(KNOBS)) {
    const value = Number(values?.[key]);
    if (Number.isFinite(value)) out[key] = Math.min(knob.max, Math.max(knob.min, value));
  }
  return out;
}

/**
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 * }} Store
 */

/** @param {Store} [storage] */
export function loadTuning(storage = globalThis.localStorage) {
  try {
    return withDefaults(JSON.parse(storage?.getItem(STORE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

/**
 * @param {Record<string, number>} values
 * @param {Store} [storage]
 */
export function saveTuning(values, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORE_KEY, JSON.stringify(withDefaults(values)));
  } catch {
    // A browser with storage turned off still gets to change the layout,
    // it just starts from the defaults next time.
  }
}
