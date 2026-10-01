/**
 * What a recording is saved as.
 *
 * The name the page goes by, and the stretch of history it holds, so a
 * folder of exports sorts and reads as what it is.
 */

/** @param {string | null | undefined} iso */
function isoDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * @param {string | null | undefined} name
 * @param {{ first?: string | null, last?: string | null, ext: string }} about
 */
export function exportFilename(name, { first, last, ext }) {
  const stem =
    String(name ?? '')
      .trim()
      .toLowerCase()
      // An apostrophe joins the word it is in; everything else separates.
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'history';
  const from = isoDay(first);
  const to = isoDay(last);
  const span = from && to ? `-${from}_${to}` : '';

  return `${stem}${span}.${ext}`;
}
