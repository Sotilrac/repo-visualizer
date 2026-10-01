import { describe, expect, it } from 'vitest';
import { clampLines, drawCommitCard } from '../src/engine/recordingCard.js';

/** Ten pixels a character, so a width of 100 is ten characters. */
const measure = (text) => text.length * 10;

describe('fitting a commit message into the card', () => {
  it('leaves a short message on one line', () => {
    expect(clampLines(measure, 'fix the bug', 200, 2)).toEqual(['fix the bug']);
  });

  it('wraps on words', () => {
    expect(clampLines(measure, 'fix the flaky test', 100, 2)).toEqual(['fix the', 'flaky test']);
  });

  it('cuts the last line short rather than running on', () => {
    const lines = clampLines(measure, 'one two three four five six seven', 100, 2);

    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('breaks a word nothing can wrap, like a long branch name', () => {
    const lines = clampLines(measure, 'espressif/bugfix/coap_sbom_version', 100, 2);

    expect(lines).toHaveLength(2);
    expect(lines.every((line) => measure(line) <= 100)).toBe(true);
  });

  it('keeps only the first line of a one-line field', () => {
    expect(clampLines(measure, 'src/engine/useTimeline.js', 100, 1)).toEqual(['src/engin…']);
  });

  it('says nothing for nothing', () => {
    expect(clampLines(measure, '', 100, 2)).toEqual([]);
    expect(clampLines(measure, null, 100, 2)).toEqual([]);
  });

  it('drops the newlines a commit body brings with it', () => {
    expect(clampLines(measure, 'subject\n\nbody text', 100, 1)).toEqual(['subject b…']);
  });
});

/** A canvas context that records nothing but can be measured against. */
function fakeContext() {
  const calls = [];
  const ctx = new Proxy(
    {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      textAlign: '',
      textBaseline: '',
      measureText: (text) => ({ width: text.length * 7 }),
      fillText: (text, x, y) => calls.push({ op: 'text', text, x, y }),
    },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => calls.push({ op: String(key), args });
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  // A Proxy answers for every method the card reaches for; the cast is what
  // tells the typechecker so.
  const asContext = /** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (ctx));
  return { ctx: asContext, calls };
}

const ink = {
  fg: '#fff',
  muted: '#aaa',
  panel: '#111',
  card: '#111',
  line: '#333',
  cool: '#8affd3',
  hot: '#ff8ad8',
};

const commit = (changes) => ({
  sha: 'a1b2c3d',
  position: '42 / 1498',
  name: 'Ada Lovelace',
  date: 'Jan 4, 2021',
  message: 'Removed effects of turning from IMU algorithm',
  stats: { files: changes.length, insertions: 120, deletions: 30 },
  changes: changes.map((path) => ({ status: 'M', path })),
});

const lots = (n) => commit(Array.from({ length: n }, (_, i) => `src/file-${i}.js`));

describe('the card burned into a recording', () => {
  // It hangs from its top edge, so the sha, the face and the message are in
  // the same place on every commit. Only the file list under them moves,
  // growing downwards. A card that reflowed around its content would jump
  // once a commit, which in a video reads as a flicker.
  it('puts the name on the same line whatever the commit touched', () => {
    const nameOf = (card) => {
      const { ctx, calls } = fakeContext();
      drawCommitCard(ctx, { x: 0, top: 40, maxHeight: 900 }, card, ink);
      return calls.find((c) => c.text === 'Ada Lovelace')?.y;
    };

    expect(nameOf(commit(['a.js']))).toBe(nameOf(lots(40)));
  });

  it('grows down to hold a longer list', () => {
    const { ctx } = fakeContext();
    const at = { x: 0, top: 40, maxHeight: 900 };

    expect(drawCommitCard(ctx, at, lots(20), ink)).toBeGreaterThan(
      drawCommitCard(ctx, at, commit(['a.js']), ink),
    );
  });

  it('stops at the room it has, and says what it left out', () => {
    const { ctx, calls } = fakeContext();

    const height = drawCommitCard(ctx, { x: 0, top: 40, maxHeight: 200 }, lots(40), ink);

    expect(height).toBeLessThanOrEqual(200);
    expect(calls.some((c) => typeof c.text === 'string' && c.text.endsWith('more'))).toBe(true);
  });

  it('keeps a one-line message from pulling the rest of the card up', () => {
    const statsOf = (message) => {
      const { ctx, calls } = fakeContext();
      drawCommitCard(ctx, { x: 0, top: 0, maxHeight: 900 }, { ...commit(['a.js']), message }, ink);
      return calls.find((c) => c.text === '1 file')?.y;
    };

    expect(statsOf('tidy')).toBe(
      statsOf('a message long enough to take both of the lines it is given'),
    );
  });

  it('draws the card background before anything goes on it', () => {
    const { ctx, calls } = fakeContext();
    drawCommitCard(ctx, { x: 0, top: 0, maxHeight: 900 }, commit(['a.js']), ink);

    const filled = calls.findIndex((c) => c.op === 'fill');
    const firstText = calls.findIndex((c) => c.op === 'text');

    expect(filled).toBeGreaterThanOrEqual(0);
    expect(filled).toBeLessThan(firstText);
  });
});
