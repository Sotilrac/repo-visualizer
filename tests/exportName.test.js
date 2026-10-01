import { describe, expect, it } from 'vitest';
import { exportFilename } from '../src/engine/exportName.js';

describe('what a recording is saved as', () => {
  it('carries the name and the span it covers', () => {
    expect(
      exportFilename("Dephy's Firmware and Software", {
        first: '2020-10-22T10:00:00Z',
        last: '2026-09-30T18:00:00Z',
        ext: 'webm',
      }),
    ).toBe('dephys-firmware-and-software-2020-10-22_2026-09-30.webm');
  });

  it('leaves the span off when there is none to give', () => {
    expect(exportFilename('flexsea-dephy', { ext: 'png' })).toBe('flexsea-dephy.png');
  });

  it('falls back to a name of its own', () => {
    expect(exportFilename('', { ext: 'gif' })).toBe('history.gif');
    expect(exportFilename(null, { ext: 'gif' })).toBe('history.gif');
  });

  it('keeps a date it cannot read out of the name', () => {
    expect(exportFilename('run', { first: 'nonsense', last: '2026-09-30', ext: 'webm' })).toBe(
      'run.webm',
    );
  });

  it('runs the punctuation of a title together', () => {
    expect(exportFilename('Six Years @ Dephy!', { ext: 'webm' })).toBe('six-years-dephy.webm');
  });
});
