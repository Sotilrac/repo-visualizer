import MobileChrome from './MobileChrome.jsx';
import RepoList from './RepoList.jsx';

const GITHUB_URL = 'https://github.com/Sotilrac/repo-visualizer';
const UPSTREAM = 'Jany-M/repo-visualizer';

/** Datasets written before the analyzer recorded remotes have only a name. */
function repoList(dataset) {
  if (dataset.repos?.length) return dataset.repos;
  return dataset.repo ? [{ name: dataset.repo, remote: null }] : [];
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function Header({
  dataset,
  aside = null,
  layout = 'desktop',
  mobileControlsOpen = false,
  mobileInfoOpen = false,
  onToggleMobileControls,
  onToggleMobileInfo,
}) {
  if (!dataset) return null;

  return (
    <header className="header">
      <div className="header-start">
        <div className="brand">
          <div className="brand-title-row">
            <div className="brand-mark">Repo Visualizer</div>
            <a
              className="brand-github"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={`Source on GitHub, forked from ${UPSTREAM}`}
              aria-label="Source on GitHub"
            >
              <GitHubIcon />
            </a>
          </div>
          <div className="brand-sub">
            <RepoList repos={repoList(dataset)} />
          </div>
        </div>
        <div className="header-repo-mobile">
          <div className="repo-name">{dataset.repo}</div>
        </div>
        {aside}
      </div>

      <div className="header-right">
        <div className="header-toolbar">
          <MobileChrome
            layout={layout}
            controlsOpen={mobileControlsOpen}
            infoOpen={mobileInfoOpen}
            onToggleControls={onToggleMobileControls}
            onToggleInfo={onToggleMobileInfo}
          />
        </div>
      </div>
    </header>
  );
}
