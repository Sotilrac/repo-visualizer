// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Header from '../src/components/Header.jsx';

afterEach(cleanup);

const dataset = { repo: 'battery', repos: [{ name: 'battery', remote: null }], commits: [] };

const header = (props = {}) =>
  render(<Header dataset={dataset} commitIndex={0} commitCount={1} {...props} />);

describe('the frame rate counter', () => {
  it('shows the rate it is given', () => {
    header({ fps: 58 });

    expect(screen.getByText('58 fps')).toBeInTheDocument();
  });

  it('says nothing until there is a rate to show', () => {
    header();

    expect(screen.queryByText(/fps/)).not.toBeInTheDocument();
  });

  it('marks a rate that has dropped', () => {
    header({ fps: 18 });

    expect(screen.getByText('18 fps').className).toContain('is-slow');
  });

  it('leaves a healthy rate unmarked', () => {
    header({ fps: 60 });

    expect(screen.getByText('60 fps').className).toBe('header-fps');
  });
});
