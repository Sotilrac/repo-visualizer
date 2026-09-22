// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CommitCard from '../src/components/CommitCard.jsx';

afterEach(cleanup);

const commit = {
  shortSha: 'abc1234',
  message: 'a change',
  author: 'Ada',
  date: '2021-03-04T10:00:00Z',
  stats: { filesChanged: 2, insertions: 10, deletions: 3 },
  changes: [{ path: 'src/a.js', added: 10, removed: 3 }],
};

describe('CommitCard', () => {
  it('shows the counts', () => {
    render(<CommitCard commit={commit} />);

    expect(screen.getByText('2 files')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
  });

  it('shows the person from the config in place of the git author', () => {
    render(<CommitCard commit={commit} author={{ name: 'Ada Lovelace', hue: 210 }} />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders their avatar when there is one', () => {
    render(<CommitCard commit={commit} author={{ name: 'Ada', avatar: 'data/avatars/ada.png' }} />);

    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'data/avatars/ada.png');
  });

  it('survives a commit with no stats rather than taking the page down', () => {
    render(<CommitCard commit={{ ...commit, stats: undefined }} />);

    expect(screen.getByText('0 files')).toBeInTheDocument();
  });

  it('survives a commit with no changes', () => {
    render(<CommitCard commit={{ ...commit, changes: undefined }} />);

    expect(screen.getByText('a change')).toBeInTheDocument();
  });
});
