import { describe, expect, it } from 'vitest';
import { parseDart } from '../scripts/importParsers.mjs';
import { createImportResolver } from '../scripts/importResolve.mjs';

describe('reading Dart imports', () => {
  it('takes a relative one', () => {
    expect(parseDart("import 'widgets/chart.dart';")).toEqual(['widgets/chart.dart']);
  });

  it('takes a package one', () => {
    expect(parseDart("import 'package:dephy/motor.dart';")).toEqual(['package:dephy/motor.dart']);
  });

  it('takes exports and parts, which point at files too', () => {
    const src = ["export 'a.dart';", "part 'b.dart';"].join('\n');

    expect(parseDart(src)).toEqual(['a.dart', 'b.dart']);
  });

  it('leaves the standard library alone', () => {
    expect(parseDart("import 'dart:async';")).toEqual([]);
  });

  it('takes double quotes as readily as single', () => {
    expect(parseDart('import "a.dart";')).toEqual(['a.dart']);
  });
});

describe('where a Dart import points', () => {
  const resolver = createImportResolver([
    'lib/main.dart',
    'lib/widgets/chart.dart',
    'lib/motor.dart',
  ]);
  const from = (file, spec) => resolver.resolve(spec, file);

  it('follows a relative path', () => {
    expect(from('lib/main.dart', './widgets/chart.dart')).toBe('lib/widgets/chart.dart');
  });

  it('follows a package path into lib', () => {
    expect(from('lib/main.dart', 'package:dephy/motor.dart')).toBe('lib/motor.dart');
  });

  it('points at nothing for a package the tree does not hold', () => {
    expect(from('lib/main.dart', 'package:flutter/material.dart')).toBeNull();
  });
});
