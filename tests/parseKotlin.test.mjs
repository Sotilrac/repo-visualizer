import { describe, expect, it } from 'vitest';
import { parseJava } from '../scripts/importParsers.mjs';
import { createImportResolver } from '../scripts/importResolve.mjs';

describe('reading Kotlin imports', () => {
  it('takes one written without a semicolon', () => {
    expect(parseJava('import com.dephy.gaitt.Session')).toEqual(['com.dephy.gaitt.Session']);
  });

  it('still takes the Java spelling', () => {
    expect(parseJava('import com.dephy.gaitt.Session;')).toEqual(['com.dephy.gaitt.Session']);
  });

  it('takes one that renames what it imports', () => {
    expect(parseJava('import com.dephy.gaitt.Session as Walk')).toEqual([
      'com.dephy.gaitt.Session',
    ]);
  });

  it('leaves the framework alone, whose simple names collide with everything', () => {
    const src = [
      'import androidx.compose.material3.Text',
      'import kotlinx.coroutines.flow.Flow',
      'import android.os.Bundle',
      'import com.dephy.gaitt.Session',
    ].join('\n');

    expect(parseJava(src)).toEqual(['com.dephy.gaitt.Session']);
  });

  it('reads a whole file, not just its head', () => {
    const src = 'package com.dephy.gaitt\n\nimport com.dephy.gaitt.Session\n\nclass Main\n';

    expect(parseJava(src)).toEqual(['com.dephy.gaitt.Session']);
  });
});

describe('where a Kotlin import points', () => {
  const resolver = createImportResolver([
    'app/src/main/kotlin/com/dephy/gaitt/Main.kt',
    'app/src/main/kotlin/com/dephy/gaitt/Session.kt',
    'build.gradle.kts',
  ]);
  const from = (file, spec) => resolver.resolve(spec, file);
  const main = 'app/src/main/kotlin/com/dephy/gaitt/Main.kt';

  it('finds the class by its simple name', () => {
    expect(from(main, 'com.dephy.gaitt.Session')).toBe(
      'app/src/main/kotlin/com/dephy/gaitt/Session.kt',
    );
  });

  it('points at nothing for a package import', () => {
    expect(from(main, 'com.dephy.gaitt.*')).toBeNull();
  });

  it('points at nothing for a class the repo does not have', () => {
    expect(from(main, 'com.elsewhere.Thing')).toBeNull();
  });
});
