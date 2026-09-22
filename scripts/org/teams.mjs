/**
 * Teams: who someone works for.
 *
 * A team owns a set of email domains, and the scan reads an address to
 * propose one. Teams are declared in the config, so adding a partner company
 * is an edit to a file and not a change to this tool.
 *
 * Two behaviours sit on the team: `shown` controls whether its people appear
 * in the visualization, which is how bots stay out of it, and `bots` marks
 * the team the scan files automated accounts under.
 */

const BOT_NAME = /\[bot\]$/i;
const BOT_EMAIL = /(\[bot\]|^(dependabot|renovate|github-actions)@)/i;

/** A forwarding address GitHub hands out; it names no employer. */
const OPAQUE_DOMAIN = /(^|\.)users\.noreply\.github\.com$/i;

/** What a config starts with before anyone adds their own teams. */
export const DEFAULT_TEAMS = [
  { id: 'external', name: 'External', shown: true, domains: [] },
  { id: 'bots', name: 'Bots', shown: false, bots: true },
];

/**
 * The team claiming an address, or null.
 *
 * @param {Array<{ id: string, domains?: string[] }>} teams
 * @param {string} email
 */
export function teamFor(teams, email) {
  const domain = email.split('@').pop()?.trim().toLowerCase();
  if (!domain) return null;
  const owner = teams.find((team) =>
    (team.domains ?? []).some((claimed) => claimed.trim().toLowerCase() === domain),
  );
  return owner?.id ?? null;
}

/**
 * The team to start a person on, for a human to correct.
 *
 * @param {{ emails: string[], names: string[] }} person
 * @param {Array<{ id: string, domains?: string[], bots?: boolean }>} teams
 * @returns {string | null}
 */
export function proposeTeam(person, teams) {
  const automated =
    person.names.some((name) => BOT_NAME.test(name)) ||
    person.emails.some((email) => BOT_EMAIL.test(email));
  if (automated) return teams.find((team) => team.bots)?.id ?? null;

  for (const team of teams) {
    if (person.emails.some((email) => teamFor(teams, email) === team.id)) return team.id;
  }

  // A noreply address identifies no employer, so someone who has only that is
  // left unset instead of being put outside on a privacy setting.
  const telling = person.emails.filter((email) => {
    const domain = email.split('@').pop() ?? '';
    return domain && !OPAQUE_DOMAIN.test(domain);
  });
  if (telling.length === 0) return null;

  return teams.find((team) => team.id === 'external')?.id ?? null;
}
