// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ExportControls, { FrameRate } from '../src/components/ExportControls.jsx';

afterEach(cleanup);

const noop = () => {};

/** The handlers the controls wire up; none of them fire in these tests. */
const handlers = {
  onToggleExport: noop,
  onCloseExport: noop,
  onStartRecord: noop,
  onStopRecord: noop,
  onPauseRecord: noop,
};

const controls = (props = {}) => render(<ExportControls {...handlers} {...props} />);

describe('the frame rate counter', () => {
  it('shows the rate it is given', () => {
    render(<FrameRate fps={58} />);

    expect(screen.getByText('58 fps')).toBeInTheDocument();
  });

  it('says nothing until there is a rate to show', () => {
    render(<FrameRate />);

    expect(screen.queryByText(/fps/)).not.toBeInTheDocument();
  });

  it('marks a rate that has dropped', () => {
    render(<FrameRate fps={18} />);

    expect(screen.getByText('18 fps').className).toContain('is-slow');
  });

  it('leaves a healthy rate unmarked', () => {
    render(<FrameRate fps={60} />);

    expect(screen.getByText('60 fps').className).toBe('header-fps');
  });
});

describe('the export button', () => {
  it('sits with the transport controls', () => {
    controls();

    expect(screen.getByLabelText('Export timeline')).toBeInTheDocument();
  });

  it('says what it is doing while it records', () => {
    controls({ recording: true, recordingProgress: 0.42 });

    expect(screen.getByText('Recording 42%')).toBeInTheDocument();
  });

  it('says what it is doing while it encodes', () => {
    controls({ encoding: true, encodeProgress: 0.8, encodeFormat: 'gif' });

    expect(screen.getByText(/Creating GIF/)).toBeInTheDocument();
  });
});
