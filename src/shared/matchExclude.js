/**
 * Match repo-relative paths against exclude patterns.
 *
 * The one implementation used by both sides: the analyzer filters files with
 * it while walking history, and the app re-applies the same pattern list from
 * history.json when filtering the graph. Two copies drifted apart before.
 *
 * Pattern forms:
 *   - ".ext"        bare extension shorthand, matched anywhere in the tree
 *   - "vendor"      folder name, matched as a prefix or as any path segment
 *   - "src/foo/**"  glob, where * spans one segment and ** spans any depth
 */

const EXTENSION_PATTERN = /^\.[a-zA-Z0-9]+$/;
const REGEX_METACHARACTER = /[.+^${}()|[\]\\]/;

/**
 * Compile a glob to an anchored regular expression.
 *
 * A single scan, so that `**` is recognised directly. The version this
 * replaced substituted a NUL byte as a placeholder for `**` and matched it
 * back afterwards.
 *
 * `?` keeps its regular expression meaning, which is how these patterns have
 * always behaved. Escaping it would silently change what every existing
 * config excludes.
 *
 * @param {string} pattern
 */
function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (REGEX_METACHARACTER.test(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * @param {string} norm normalised repo-relative path
 * @param {string} pattern
 */
function matchesLiteral(norm, pattern) {
  const p = pattern.replace(/\/$/, '');
  if (!p) return false;
  if (norm === p) return true;
  if (norm.startsWith(`${p}/`)) return true;
  return norm.split('/').includes(p);
}

/** @param {string} filePath */
function normalise(filePath) {
  return filePath.split('\\').join('/').replace(/^\.\//, '');
}

/** @param {string} norm */
function extensionOf(norm) {
  const i = norm.lastIndexOf('.');
  return i >= 0 ? norm.slice(i).toLowerCase() : '';
}

/**
 * @param {string} filePath repo-relative path
 * @param {string[]} [patterns]
 * @returns {boolean}
 */
export function matchesExcludePattern(filePath, patterns) {
  if (!patterns?.length) return false;
  const norm = normalise(filePath);
  const ext = extensionOf(norm);
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (EXTENSION_PATTERN.test(pattern)) {
      if (ext === pattern.toLowerCase()) return true;
      continue;
    }
    if (pattern.includes('*')) {
      if (globToRegExp(pattern).test(norm)) return true;
    } else if (matchesLiteral(norm, pattern)) {
      return true;
    }
  }
  return false;
}
