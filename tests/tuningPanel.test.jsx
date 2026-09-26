// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TuningPanel from '../src/components/TuningPanel.jsx';
import { DEFAULT_TUNING } from '../src/engine/tuning.js';

afterEach(cleanup);

const panel = (props = {}) =>
  render(
    <TuningPanel
      tuning={{ ...DEFAULT_TUNING }}
      onChange={() => {}}
      onReset={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );

describe('TuningPanel', () => {
  it('shows a slider for every setting', () => {
    panel();

    expect(screen.getAllByRole('slider')).toHaveLength(Object.keys(DEFAULT_TUNING).length);
  });

  it('reports which knob moved and where to', () => {
    const onChange = vi.fn();
    panel({ onChange });

    fireEvent.change(screen.getByRole('slider', { name: /Repulsion/ }), { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledWith('repel', 2);
  });

  it('shows the value beside its name', () => {
    panel({ tuning: { ...DEFAULT_TUNING, avatarLinger: 30 } });

    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('offers no reset until something has been changed', () => {
    panel();

    expect(screen.getByRole('button', { name: 'reset' })).toBeDisabled();
  });

  it('offers one once something has', () => {
    panel({ tuning: { ...DEFAULT_TUNING, repel: 3 } });

    expect(screen.getByRole('button', { name: 'reset' })).toBeEnabled();
  });

  it('closes on escape', () => {
    const onClose = vi.fn();
    panel({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
