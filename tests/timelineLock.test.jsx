// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Timeline from '../src/components/Timeline.jsx';
import { createTimeScale } from '../src/engine/timelineScale.js';

afterEach(cleanup);

/** Two years of commits, one a day, so the scale has something to work with. */
const commits = Array.from({ length: 730 }, (_, i) => ({
  date: new Date(Date.UTC(2023, 0, 1 + i)).toISOString(),
}));

const scale = createTimeScale(commits);
/** @param {ParentNode} container */
const styleOf = (container, selector) =>
  /** @type {HTMLElement} */ (container.querySelector(selector)).style;
const handleAt = (container) => Number.parseFloat(styleOf(container, '.timeline-handle').left);

describe('the scrubber while the graph is catching up', () => {
  it('sits where the timeline has actually got to when nothing is pending', () => {
    const { container } = render(<Timeline commits={commits} index={100} onSeek={() => {}} />);

    expect(handleAt(container)).toBeCloseTo(scale.pctOf(100), 3);
  });

  it('stays at the commit being seeked to, not the one it came from', () => {
    // A long rebuild: the timeline is still at 100 and heading for 600.
    const { container } = render(
      <Timeline commits={commits} index={100} seekingTo={600} onSeek={() => {}} />,
    );

    expect(handleAt(container)).toBeCloseTo(scale.pctOf(600), 3);
  });

  it('says where it is heading, for anything reading the slider', () => {
    const { container } = render(
      <Timeline commits={commits} index={100} seekingTo={600} onSeek={() => {}} />,
    );

    expect(container.querySelector('[role="slider"]').getAttribute('aria-valuenow')).toBe('600');
  });

  it('lets go once the rebuild lands', () => {
    const { container, rerender } = render(
      <Timeline commits={commits} index={100} seekingTo={600} onSeek={() => {}} />,
    );
    rerender(<Timeline commits={commits} index={600} seekingTo={null} onSeek={() => {}} />);

    expect(handleAt(container)).toBeCloseTo(scale.pctOf(600), 3);
  });

  it('fills the bar up to where it is heading', () => {
    const { container } = render(
      <Timeline commits={commits} index={100} seekingTo={600} onSeek={() => {}} />,
    );
    const filled = Number.parseFloat(styleOf(container, '.timeline-progress').width);

    expect(filled).toBeCloseTo(scale.pctOf(600), 3);
  });
});
