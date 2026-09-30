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
  folderDepth: {
    label: 'Folder depth',
    hint: 'How many folder levels a repo breaks into. Deeper shows more imports, since an import inside one bubble has nothing to draw. Zero follows the config',
    group: 'Imports',
    value: 0,
    min: 0,
    max: 6,
    step: 1,
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
  cameraEase: {
    label: 'Camera easing',
    hint: 'How long the camera takes to follow the graph while auto fit is on',
    group: 'Camera',
    value: 1100,
    min: 60,
    max: 4000,
    step: 20,
  },
  labelLength: {
    label: 'Name length',
    hint: 'How many characters of a name to show at normal zoom. Less as you pull back',
    group: 'Labels',
    value: 22,
    min: 6,
    max: 48,
    step: 1,
  },
  countFrom: {
    label: 'Counts from',
    hint: 'How big a folder has to be drawn, in pixels, before its file count is shown',
    group: 'Labels',
    value: 16,
    min: 0,
    max: 60,
    step: 1,
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
    hint: 'How far apart two people push each other, hard up close and gently at a distance',
    group: 'People',
    value: 242,
    min: 28,
    max: 260,
    step: 2,
  },
  avatarDamping: {
    label: 'Avatar damping',
    hint: 'How much speed a person loses each step. Higher settles sooner, lower drifts further',
    group: 'People',
    value: 0.45,
    min: 0.05,
    max: 0.9,
    step: 0.01,
  },
  standoff: {
    label: 'Avatar standoff',
    hint: 'How far outside a repo someone stands to fire at it',
    group: 'People',
    value: 250,
    min: 0,
    max: 600,
    step: 2,
  },
};

/**
 * How deep to break a repo into folders.
 *
 * An import between two files inside the same bubble has nothing to draw
 * between, so the shallower the tree the fewer imports are visible. The
 * knob overrides what the config asked for; zero leaves the config in
 * charge, which is what it is set to until somebody moves it.
 *
 * @param {number | undefined} tuned
 * @param {number | undefined} configured
 */
export function folderDepthOf(tuned, configured) {
  const wanted = Number(tuned);
  if (Number.isFinite(wanted) && wanted > 0) return Math.round(wanted);
  const fromConfig = Number(configured);
  return Number.isFinite(fromConfig) && fromConfig > 0 ? Math.round(fromConfig) : 2;
}

/**
 * The fraction of the way the camera moves in a 16ms frame, for a given
 * time constant in milliseconds.
 *
 * @param {number} ms
 */
export function cameraSpeed(ms) {
  return 1 - Math.exp(-16 / Math.max(16, ms));
}

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
