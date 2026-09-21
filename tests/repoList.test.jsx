// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import RepoList from '../src/components/RepoList.jsx';

afterEach(cleanup);

const one = [{ name: 'repo-visualizer', remote: 'https://github.com/Sotilrac/repo-visualizer' }];
const three = [
  { name: 'core-firmware', remote: 'https://github.com/Acme/core-firmware' },
  { name: 'battery', remote: 'https://github.com/Acme/battery' },
  { name: 'toolbox', remote: null },
];

describe('a single repo', () => {
  it('renders its name as a link to the remote', () => {
    render(<RepoList repos={one} />);

    const link = screen.getByRole('link', { name: 'repo-visualizer' });
    expect(link).toHaveAttribute('href', 'https://github.com/Sotilrac/repo-visualizer');
  });

  it('opens the remote in a new tab without leaking the referrer', () => {
    render(<RepoList repos={one} />);

    const link = screen.getByRole('link', { name: 'repo-visualizer' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders plain text when there is no remote to link to', () => {
    render(<RepoList repos={[{ name: 'shopify', remote: null }]} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('shopify')).toBeInTheDocument();
  });
});

describe('several repos', () => {
  it('collapses to a count', () => {
    render(<RepoList repos={three} />);

    expect(screen.getByRole('button', { name: /3 repos/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'battery' })).toBeNull();
  });

  it('lists them all on expand', async () => {
    render(<RepoList repos={three} />);

    await userEvent.click(screen.getByRole('button', { name: /3 repos/i }));

    expect(screen.getByRole('link', { name: 'core-firmware' })).toHaveAttribute(
      'href',
      'https://github.com/Acme/core-firmware',
    );
    expect(screen.getByRole('link', { name: 'battery' })).toBeInTheDocument();
    expect(screen.getByText('toolbox')).toBeInTheDocument();
  });

  it('collapses again on a second click', async () => {
    render(<RepoList repos={three} />);
    const toggle = screen.getByRole('button', { name: /3 repos/i });

    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(screen.queryByRole('link', { name: 'battery' })).toBeNull();
  });

  it('reports its expanded state to assistive technology', async () => {
    render(<RepoList repos={three} />);
    const toggle = screen.getByRole('button', { name: /3 repos/i });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('nothing to show', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<RepoList repos={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the list is missing', () => {
    const { container } = render(<RepoList />);

    expect(container).toBeEmptyDOMElement();
  });
});
