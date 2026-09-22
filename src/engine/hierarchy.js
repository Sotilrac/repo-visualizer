/**
 * A file's place in the tree, and which part of that tree is drawn.
 *
 * A dataset path is `repo/dir/.../file`. Above the repo there may be a
 * project, and below it folders nest to a configured depth. Each repo has a
 * level of detail, which is how far down to draw:
 *
 *   0  the repo is left out
 *   1  one bubble for the repo
 *   2  the repo's folders
 *   3  the files
 *
 * A file's entity id is its full path, and a container's id is the prefix it
 * covers, so an id carries its own position and `ancestorsOf` reads the
 * containers straight off it. A project is prefixed `~` because a project and a repo
 * can share a name and must not share an id.
 */

const PROJECT_MARK = '~';

/** How deep folders nest before the rest of the path collapses into the file. */
const DEFAULT_FOLDER_DEPTH = 2;

/**
 * Every entity a path belongs to, outermost first, ending with the file.
 *
 * @param {string} path
 * @param {{ folderDepth?: number, project?: string }} [settings]
 * @returns {string[]}
 */
export function entityChain(path, { folderDepth = DEFAULT_FOLDER_DEPTH, project } = {}) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return [];

  const chain = [];
  let prefix = '';

  if (project) {
    prefix = `${PROJECT_MARK}${project}`;
    chain.push(prefix);
  }

  const [repo, ...rest] = parts;
  prefix = prefix ? `${prefix}/${repo}` : repo;
  chain.push(prefix);

  const folders = rest.slice(0, Math.max(0, rest.length - 1)).slice(0, folderDepth);
  for (const folder of folders) {
    prefix = `${prefix}/${folder}`;
    chain.push(prefix);
  }

  // The file keeps its whole path, so two files under the same collapsed
  // folder are still distinct.
  if (rest.length > 0) chain.push(project ? `${PROJECT_MARK}${project}/${path}` : path);
  return chain;
}

/**
 * The entity actually drawn for a path, or null when its repo is hidden.
 *
 * @param {string} path
 * @param {{ lod?: number, folderDepth?: number, project?: string }} [settings]
 */
export function visibleEntity(path, settings = {}) {
  const lod = settings.lod ?? 1;
  if (lod <= 0) return null;

  const chain = entityChain(path, settings);
  if (chain.length === 0) return null;

  // The level picks how far down to stop, and folderDepth bounds how many
  // folder levels there are. A project is above them all and takes no level
  // of its own.
  if (lod >= 3) return chain[chain.length - 1];

  const repoAt = settings.project ? 1 : 0;
  if (lod <= 1) return chain[repoAt];

  // Level 2: the deepest folder, which is the last entity before the file.
  // A file with no folder has none, so its repo is what gets drawn.
  const deepest = chain.length - 2;
  return chain[Math.max(repoAt, deepest)];
}

/**
 * The containers of an entity, outermost first.
 *
 * @param {string} id
 */
export function ancestorsOf(id) {
  const parts = id.split('/');
  const out = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}

/**
 * @param {string} id
 * @returns {'project' | 'repo' | 'folder' | 'file'}
 */
export function entityKind(id) {
  if (id.includes('.') && /\.[^./]+$/.test(id)) return 'file';
  const parts = id.split('/');
  if (parts.length === 1) return parts[0].startsWith(PROJECT_MARK) ? 'project' : 'repo';
  if (parts.length === 2 && parts[0].startsWith(PROJECT_MARK)) return 'repo';
  return 'folder';
}
