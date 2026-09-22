// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfigEditor from '../src/config/ConfigEditor.jsx';

describe('the editor page', () => {
  it('renders the rows the api returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          path: '/tmp/viz.yaml',
          config: {
            teams: [{ id: 'acme', name: 'Acme', shown: true }],
            people: [
              { id: 'ada', name: 'Ada Lovelace', team: 'acme', commits: 7, emails: ['a@acme.com'] },
            ],
            repos: [{ name: 'battery', lod: 2, commits: 10, files: 4 }],
          },
        }),
      })),
    );

    render(<ConfigEditor />);

    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('/tmp/viz.yaml')).toBeInTheDocument();
  });
});

describe('a person who was merged', () => {
  it('still shows the other names they commit under', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          path: '/tmp/viz.yaml',
          config: {
            teams: [{ id: 'acme', name: 'Acme', shown: true }],
            people: [
              {
                id: 'enoether',
                name: 'enoether',
                names: ['enoether', 'EmmyN'],
                team: 'acme',
                commits: 175,
                emails: ['a@acme.com'],
              },
            ],
            repos: [],
          },
        }),
      })),
    );

    render(<ConfigEditor />);

    await waitFor(() => expect(screen.getByText(/EmmyN/)).toBeInTheDocument());
  });
});
