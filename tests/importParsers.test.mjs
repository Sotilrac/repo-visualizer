import { describe, expect, it } from 'vitest';
import {
  ANALYZER_LANGUAGES,
  PARSERS,
  parseCss,
  parseGo,
  parseJava,
  parseJsTs,
  parsePhp,
  parsePython,
  parseRuby,
  parseRust,
} from '../scripts/importParsers.mjs';

describe('parseJsTs', () => {
  it('reads default, named, namespace and side-effect imports', () => {
    const src = `
      import React from 'react';
      import { a, b } from './a.js';
      import * as ns from "../ns";
      import './side-effect.css';
    `;
    expect(parseJsTs(src).sort()).toEqual(['../ns', './a.js', './side-effect.css', 'react']);
  });

  it('reads re-exports', () => {
    expect(parseJsTs(`export { a } from './a.js';`)).toContain('./a.js');
    expect(parseJsTs(`export * from './b.js';`)).toContain('./b.js');
    expect(parseJsTs(`export * as ns from './c.js';`)).toContain('./c.js');
  });

  it('reads require and dynamic import', () => {
    expect(parseJsTs(`const x = require('./x');`)).toContain('./x');
    expect(parseJsTs(`const y = await import('./y');`)).toContain('./y');
  });

  it('reads multiline import clauses', () => {
    const src = `import {\n  a,\n  b,\n} from './multi.js';`;
    expect(parseJsTs(src)).toContain('./multi.js');
  });

  it('deduplicates a specifier imported twice', () => {
    expect(parseJsTs(`import a from './x';\nimport b from './x';`)).toEqual(['./x']);
  });

  it('returns an empty list for a file with no imports', () => {
    expect(parseJsTs('const a = 1;')).toEqual([]);
  });
});

describe('parsePython', () => {
  it('reads dotted modules and from-imports', () => {
    const src = 'import os\nfrom pkg.mod import thing\n';
    expect(parsePython(src).sort()).toEqual(['os', 'pkg.mod']);
  });

  it('reads relative imports at each level', () => {
    expect(parsePython('from . import x')).toContain('.');
    expect(parsePython('from ..pkg import x')).toContain('..pkg');
  });

  it('splits a comma-separated import and drops the alias', () => {
    expect(parsePython('import a, b as c').sort()).toEqual(['a', 'b']);
  });

  it('ignores the word import inside a comment body', () => {
    expect(parsePython('x = 1  # import os')).toEqual([]);
  });
});

describe('parseGo', () => {
  it('reads a parenthesised import block', () => {
    const src = 'import (\n\t"fmt"\n\t"example.com/pkg/sub"\n)';
    expect(parseGo(src).sort()).toEqual(['example.com/pkg/sub', 'fmt']);
  });

  it('reads a single-line import', () => {
    expect(parseGo('import "fmt"')).toEqual(['fmt']);
  });
});

describe('parseRust', () => {
  it('keeps the crate, super and self prefixes', () => {
    expect(parseRust('use crate::engine::layout;')).toEqual(['crate::engine::layout']);
    expect(parseRust('use super::thing;')).toEqual(['super::thing']);
  });

  it('truncates a braced group to its common prefix', () => {
    expect(parseRust('use crate::a::{b, c};')).toEqual(['crate::a::']);
  });

  it('strips a glob suffix', () => {
    expect(parseRust('use crate::prelude::*;')).toEqual(['crate::prelude']);
  });

  it('tags mod declarations so they resolve separately', () => {
    expect(parseRust('mod layout;')).toEqual(['mod:layout']);
  });
});

describe('parseJava', () => {
  it('reads imports and static imports', () => {
    const src = 'import com.example.Thing;\nimport static com.example.Util.helper;';
    expect(parseJava(src).sort()).toEqual(['com.example.Thing', 'com.example.Util.helper']);
  });

  it('drops the JDK packages, which are never files in the repo', () => {
    expect(parseJava('import java.util.List;\nimport javax.swing.JFrame;')).toEqual([]);
  });
});

describe('parseRuby', () => {
  it('reads require and require_relative', () => {
    const src = "require 'json'\nrequire_relative '../lib/thing'";
    expect(parseRuby(src).sort()).toEqual(['../lib/thing', 'json']);
  });
});

describe('parsePhp', () => {
  it('reads use statements with namespace separators', () => {
    expect(parsePhp('use App\\Models\\User;')).toContain('App\\Models\\User');
  });

  it('reads require and include in both forms', () => {
    expect(parsePhp("require_once 'bootstrap.php';")).toContain('bootstrap.php');
    expect(parsePhp("include('helpers.php');")).toContain('helpers.php');
  });

  it('reads a __DIR__ join', () => {
    expect(parsePhp("require __DIR__ . '/../config.php';")).toContain('/../config.php');
  });
});

describe('parseCss', () => {
  it('reads quoted, unquoted and url() imports', () => {
    const src = "@import 'a.css';\n@import url(b.css);\n@import url('c.css');";
    expect(parseCss(src).sort()).toEqual(['a.css', 'b.css', 'c.css']);
  });
});

describe('the parser registry', () => {
  it('maps every declared extension to its language parser', () => {
    for (const lang of ANALYZER_LANGUAGES) {
      for (const ext of lang.extensions) {
        expect(PARSERS[ext]).toBe(lang.parse);
      }
    }
  });

  it('claims no extension twice', () => {
    const all = ANALYZER_LANGUAGES.flatMap((l) => l.extensions);
    expect(all.length).toBe(new Set(all).size);
  });

  it('lists every extension with a leading dot in lowercase', () => {
    for (const ext of Object.keys(PARSERS)) {
      expect(ext).toBe(ext.toLowerCase());
      expect(ext.startsWith('.')).toBe(true);
    }
  });
});
