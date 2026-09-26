/** The dev server brokers the config file; see scripts/org/configEditorPlugin.mjs. */

async function call(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

export function readConfig() {
  return call('/api/config');
}

/** @param {Array<Record<string, unknown>>} edits */
export function applyEdits(edits) {
  return call('/api/config/edits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ edits }),
  });
}

/** @param {{ id: string, source: string, email?: string, filePath?: string }} request */
export function setAvatar(request) {
  return call('/api/config/avatar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

/** @param {{ overwrite?: boolean, handles?: boolean }} [options] */
export function fillAvatars(options = {}) {
  return call('/api/config/avatars', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  });
}
