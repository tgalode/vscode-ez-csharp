import { describe, expect, it } from 'vitest';
import { parseSlnf } from '../src/model/slnfParser';

describe('parseSlnf', () => {
  it('reads the solution path and the filtered projects, normalizing separators', () => {
    const result = parseSlnf(
      JSON.stringify({ solution: { path: '..\\My.sln', projects: ['src\\A\\A.csproj'] } }),
    );

    expect(result.solutionRelativePath).toBe('../My.sln');
    expect(result.projects).toEqual([{ name: 'A', relativePath: 'src/A/A.csproj' }]);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports malformed JSON instead of throwing', () => {
    const result = parseSlnf('{ not json');

    expect(result.projects).toEqual([]);
    expect(result.diagnostics[0]).toContain('Malformed JSON');
  });

  it('reports a missing solution object', () => {
    expect(parseSlnf('{}').diagnostics).toEqual(['No "solution" object.']);
  });

  it('reports a missing solution path', () => {
    expect(parseSlnf(JSON.stringify({ solution: { projects: [] } })).diagnostics).toEqual([
      'No "solution.path" value.',
    ]);
  });

  it('reports an absent projects array but still resolves the solution', () => {
    const result = parseSlnf(JSON.stringify({ solution: { path: 'My.sln' } }));

    expect(result.solutionRelativePath).toBe('My.sln');
    expect(result.projects).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  it('skips entries that are not paths', () => {
    const result = parseSlnf(
      JSON.stringify({ solution: { path: 'My.sln', projects: ['a.csproj', 42, ''] } }),
    );

    expect(result.projects.map((project) => project.name)).toEqual(['a']);
    expect(result.diagnostics).toHaveLength(2);
  });
});
