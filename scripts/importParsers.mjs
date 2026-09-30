/**
 * Language-specific import extractors (raw specifiers, unresolved).
 */

export function parseJsTs(src) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    /export\s+(?:\{[^}]*\}|\*\s*(?:\s+as\s+\w+)?|\w+)\s+from\s+['"`]([^'"`]+)['"`]/g,
    /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) imports.add(m[1]);
  }
  return [...imports];
}

export function parsePython(src) {
  const imports = new Set();
  const fromRe = /^\s*from\s+(\.+[\w.]*|[\w.]+)\s+import/gm;
  const importRe = /^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/gm;
  for (const m of src.matchAll(fromRe)) imports.add(m[1]);
  for (const m of src.matchAll(importRe)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) imports.add(name);
    }
  }
  return [...imports];
}

export function parseGo(src) {
  const imports = new Set();
  const blockRe = /import\s*\(([\s\S]*?)\)/g;
  const singleRe = /import\s+"([^"]+)"/g;
  for (const m of src.matchAll(blockRe)) {
    for (const n of m[1].matchAll(/"([^"]+)"/g)) imports.add(n[1]);
  }
  for (const m of src.matchAll(singleRe)) imports.add(m[1]);
  return [...imports];
}

export function parseRust(src) {
  const imports = new Set();
  const useRe = /^\s*use\s+((?:crate|super|self)::)?([\w:*{}]+)/gm;
  for (const m of src.matchAll(useRe)) {
    const prefix = m[1] || '';
    const path = m[2].split('{')[0].replace(/::\*$/, '').trim();
    if (path) imports.add(prefix + path);
  }
  const modRe = /^\s*mod\s+(\w+)\s*;/gm;
  for (const m of src.matchAll(modRe)) imports.add(`mod:${m[1]}`);
  return [...imports];
}

/**
 * What a Java or Kotlin import names.
 *
 * Kotlin writes the same line without the semicolon Java insists on, and
 * may rename what it imports with `as`. The framework packages are dropped
 * here rather than left to the resolver: a simple name like `Text` or
 * `Card` matches a repo class of that name, and an Android import would
 * quietly become a link to a file it has nothing to do with.
 */
const LIBRARY_PACKAGES = [
  'java.',
  'javax.',
  'kotlin.',
  'kotlinx.',
  'android.',
  'androidx.',
  'dagger.',
  'org.junit.',
  'com.google.',
];

export function parseJava(src) {
  const imports = new Set();
  const re =
    /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+(?:\.\*)?)[ \t]*(?:as[ \t]+\w+)?[ \t]*;?[ \t]*$/gm;
  for (const m of src.matchAll(re)) {
    const name = m[1];
    if (LIBRARY_PACKAGES.some((pkg) => name.startsWith(pkg))) continue;
    imports.add(name);
  }
  return [...imports];
}

export function parseRuby(src) {
  const imports = new Set();
  const patterns = [
    /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm,
    /^\s*load(?:_relative)?\s+['"]([^'"]+)['"]/gm,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) imports.add(m[1]);
  }
  return [...imports];
}

export function parsePhp(src) {
  const imports = new Set();
  const patterns = [
    /^\s*use\s+([\w\\]+)/gm,
    /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g,
    /__DIR__\s*\.\s*['"]([^'"]+)['"]/g,
    /(?:require|include)(?:_once)?\s*\(?\s*__DIR__\s*\.\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) imports.add(m[1]);
  }
  return [...imports];
}

export function parseCss(src) {
  const imports = new Set();
  const re = /@import\s+(?:url\()?['"]?([^'")\s;]+)['"]?\)?/g;
  for (const m of src.matchAll(re)) imports.add(m[1]);
  return [...imports];
}

/**
 * C and C++ includes, both spellings.
 *
 * `"foo.h"` looks beside the including file first and `<foo.h>` looks along
 * the include path, but which of the two a project uses for its own headers
 * is a matter of habit, so both are read and the resolver decides whether
 * the name belongs to the repo or to the toolchain.
 */
export function parseC(src) {
  const imports = new Set();
  const re = /^[ \t]*#[ \t]*include[ \t]*(?:"([^"\n]+)"|<([^>\n]+)>)/gm;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? m[2];
    if (spec) imports.add(spec.trim());
  }
  return [...imports];
}

/**
 * Dart, which is what a Flutter app is written in.
 *
 * `package:` imports name a published package or the app's own `lib`
 * folder; relative ones name a file beside the importer. Both are read and
 * the resolver works out which of them the tree answers to.
 */
export function parseDart(src) {
  const imports = new Set();
  const re = /^[ \t]*(?:import|export|part)\s+['"]([^'"\n]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    const spec = m[1].trim();
    if (spec && !spec.startsWith('dart:')) imports.add(spec);
  }
  return [...imports];
}

/** Human-readable language list (single source of truth for README + CLI). */
export const ANALYZER_LANGUAGES = [
  {
    name: 'JavaScript / TypeScript',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'],
    parse: parseJsTs,
    resolution: 'Relative paths; `tsconfig` / `jsconfig` `paths` aliases',
  },
  {
    name: 'Python',
    extensions: ['.py'],
    parse: parsePython,
    resolution: 'Relative (`from .`, `from ..`), dotted modules, `__init__.py` package index',
  },
  {
    name: 'Go',
    extensions: ['.go'],
    parse: parseGo,
    resolution: 'Import path suffix → file under repo',
  },
  {
    name: 'Rust',
    extensions: ['.rs'],
    parse: parseRust,
    resolution: '`use` / `mod`; `crate::`, `super::`, `self::`',
  },
  {
    name: 'Java / Kotlin',
    extensions: ['.java', '.kt', '.kts'],
    parse: parseJava,
    resolution: 'FQCN and simple class name',
  },
  {
    name: 'Ruby',
    extensions: ['.rb'],
    parse: parseRuby,
    resolution: '`require` / `require_relative`',
  },
  {
    name: 'PHP',
    extensions: ['.php'],
    parse: parsePhp,
    resolution: '`use`, `require`/`include`, `__DIR__` joins, dotted namespace paths',
  },
  {
    name: 'Dart / Flutter',
    extensions: ['.dart'],
    parse: parseDart,
    resolution: '`import` / `export` / `part`; relative paths and `package:` into `lib`',
  },
  {
    name: 'C / C++',
    extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx', '.ino'],
    parse: parseC,
    resolution: '`#include`, beside the file or anywhere in the same repo',
  },
  {
    name: 'CSS / SCSS / Sass / Less',
    extensions: ['.css', '.scss', '.sass', '.less'],
    parse: parseCss,
    resolution: '`@import`',
  },
];

export const PARSERS = Object.fromEntries(
  ANALYZER_LANGUAGES.flatMap((lang) => lang.extensions.map((ext) => [ext, lang.parse])),
);
