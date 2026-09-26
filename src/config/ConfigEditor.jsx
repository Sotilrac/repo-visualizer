import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyEdits, fillAvatars, readConfig, setAvatar } from './api.js';
import PeopleTable from './PeopleTable.jsx';
import ReposTable from './ReposTable.jsx';
import TeamsTable from './TeamsTable.jsx';

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'teams', label: 'Teams' },
  { id: 'repos', label: 'Repos' },
];

export default function ConfigEditor() {
  const [state, setState] = useState({ status: 'loading', config: null, path: '', error: '' });
  const [tab, setTab] = useState('people');
  const [query, setQuery] = useState('');
  const [savedAt, setSavedAt] = useState(0);
  // Bumped on every successful write; avatar URLs carry it so a redrawn tile
  // is fetched again rather than read from the browser's cache.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    readConfig()
      .then(({ config, path }) => setState({ status: 'ready', config, path, error: '' }))
      .catch((err) => setState({ status: 'error', config: null, path: '', error: err.message }));
  }, []);

  /**
   * Every change is written to the file as it is made; there is no save
   * button. Each mutation answers with the config as it now stands, so the
   * page shows what is on disk rather than what it hoped for.
   */
  const run = useCallback(async (work) => {
    try {
      const { config, path } = await work();
      setState((prev) => ({ ...prev, status: 'ready', config, path, error: '' }));
      setSavedAt(Date.now());
      setVersion((n) => n + 1);
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    }
  }, []);

  const edit = useCallback((...edits) => run(() => applyEdits(edits)), [run]);
  const avatar = useCallback((request) => run(() => setAvatar(request)), [run]);

  const counts = useMemo(() => {
    const people = state.config?.people ?? [];
    const repos = state.config?.repos ?? [];
    const teams = state.config?.teams ?? [];
    const hidden = new Set(teams.filter((t) => t.shown === false).map((t) => t.id));
    return {
      drawn: people.filter((p) => !hidden.has(p.team)).length,
      hiddenPeople: people.filter((p) => hidden.has(p.team)).length,
      unassigned: people.filter((p) => !p.team).length,
      teams: teams.length,
      shown: repos.filter((r) => (r.lod ?? 1) > 0).length,
      hiddenRepos: repos.filter((r) => (r.lod ?? 1) === 0).length,
    };
  }, [state.config]);

  // The confirmation is worth showing and not worth dwelling on.
  useEffect(() => {
    if (!savedAt) return undefined;
    const id = setTimeout(() => setSavedAt(0), 1600);
    return () => clearTimeout(id);
  }, [savedAt]);

  if (state.status === 'loading') {
    return (
      <div className="loader">
        <div className="spinner" />
        <p>Reading the config…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="editor-empty">
        <h1>Config editor</h1>
        <p className="editor-error">{state.error}</p>
        <p>
          Start it with <code>make edit CONFIG=../config/org.viz.yaml</code>, or set{' '}
          <code>REPO_VIZ_CONFIG</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <div>
          <h1>Config editor</h1>
          <p className="editor-path" title={state.path}>
            {state.path}
            <span className={`editor-saved${savedAt ? ' is-visible' : ''}`} aria-live="polite">
              {savedAt ? 'saved' : ''}
            </span>
          </p>
        </div>
        <nav className="editor-tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`editor-tab${tab === t.id ? ' is-active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <p className="editor-counts">
          {tab === 'people' &&
            `${counts.drawn} drawn · ${counts.hiddenPeople} hidden · ${counts.unassigned} unassigned`}
          {tab === 'teams' && `${counts.teams} teams`}
          {tab === 'repos' && `${counts.shown} shown · ${counts.hiddenRepos} hidden`}
        </p>
      </header>

      {state.error && <p className="editor-error">{state.error}</p>}

      {tab === 'people' && (
        <div className="editor-bar editor-bar--quiet">
          <span>
            Give everyone an avatar: their GitHub account where their commits name one, gravatar
            failing that, initials otherwise.
          </span>
          <button type="button" onClick={() => run(() => fillAvatars())}>
            fill the gaps
          </button>
          <button type="button" onClick={() => run(() => fillAvatars({ overwrite: true }))}>
            refetch all
          </button>
          <button
            type="button"
            title="Also try a GitHub account named after a spelling of their name. A guess: check the faces."
            onClick={() => run(() => fillAvatars({ handles: true }))}
          >
            guess handles
          </button>
        </div>
      )}

      <div className="editor-search">
        <label className="visually-hidden" htmlFor="editor-filter">
          Filter rows
        </label>
        <input
          id="editor-filter"
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
        />
        {query && (
          <button
            type="button"
            className="editor-search-clear"
            aria-label="Clear the filter"
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </div>

      {tab === 'people' && (
        <PeopleTable
          people={state.config.people ?? []}
          teams={state.config.teams ?? []}
          merge={state.config.merge ?? []}
          query={query}
          version={version}
          onEdit={edit}
          onAvatar={avatar}
        />
      )}
      {tab === 'teams' && (
        <TeamsTable
          teams={state.config.teams ?? []}
          people={state.config.people ?? []}
          onEdit={edit}
        />
      )}
      {tab === 'repos' && (
        <ReposTable repos={state.config.repos ?? []} query={query} onEdit={edit} />
      )}
    </div>
  );
}
