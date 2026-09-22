import { describe, expect, it } from 'vitest';
import { applyMergeList } from '../scripts/org/identities.mjs';

const person = (id, name, emails, commits) => ({
  id,
  name,
  names: [name],
  emails,
  commits,
  team: 'acme',
});

const people = [
  person('grace-hopper', 'Grace Hopper', ['ghopper@acme.com'], 24),
  person('ghopper81', 'ghopper81', ['1+ghopper81@users.noreply.github.com'], 31),
  person('ada', 'Ada', ['ada@acme.com'], 5),
];

describe('applyMergeList', () => {
  it('folds the named rows into the first one', () => {
    const merged = applyMergeList(people, [['grace-hopper', 'ghopper81']]);

    expect(merged.map((p) => p.id).sort()).toEqual(['ada', 'grace-hopper']);
  });

  it('sums their commits', () => {
    const [paul] = applyMergeList(people, [['grace-hopper', 'ghopper81']]);

    expect(paul.commits).toBe(55);
  });

  it('keeps every address and spelling', () => {
    const [paul] = applyMergeList(people, [['grace-hopper', 'ghopper81']]);

    expect(paul.emails).toContain('1+ghopper81@users.noreply.github.com');
    expect(paul.names).toContain('ghopper81');
  });

  it('keeps the first row name and team, not the larger one', () => {
    const [paul] = applyMergeList(people, [['grace-hopper', 'ghopper81']]);

    expect(paul.name).toBe('Grace Hopper');
  });

  it('re-sorts so the merged person sits at their combined size', () => {
    const merged = applyMergeList(
      [...people, person('big', 'Big', ['big@acme.com'], 40)],
      [['grace-hopper', 'ghopper81']],
    );

    expect(merged.map((p) => p.id)).toEqual(['grace-hopper', 'big', 'ada']);
  });

  it('ignores an id that is not in the list', () => {
    expect(applyMergeList(people, [['grace-hopper', 'nobody-here']])).toHaveLength(3);
  });

  it('ignores a group naming a single row', () => {
    expect(applyMergeList(people, [['ada']])).toHaveLength(3);
  });

  it('folds a chain of three', () => {
    const merged = applyMergeList(people, [['grace-hopper', 'ghopper81', 'ada']]);

    expect(merged).toHaveLength(1);
    expect(merged[0].commits).toBe(60);
  });

  it('returns the people untouched when there is no merge list', () => {
    expect(applyMergeList(people, [])).toEqual(people);
  });
});
