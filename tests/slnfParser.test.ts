import { describe, expect, it } from 'vitest';
import { parseSlnf } from '../src/model/slnfParser';

describe('parseSlnf', () => {
  it('reads the solution path and the filtered projects, normalizing separators', () => {
    const result = parseSlnf(
      JSON.stringify({ solution: { path: '..\\My.sln', projects: ['src\\A\\A.csproj'] } }),
    );

    expect(result.solutionRelativePath).toBe('../My.sln');
    // Positions are asserted on their own below; this test is about normalization.
    expect(result.projects.map(({ name, relativePath }) => ({ name, relativePath }))).toEqual([
      { name: 'A', relativePath: 'src/A/A.csproj' },
    ]);
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

  it('records where each project entry sits in the source', () => {
    const content = '{"solution":{"path":"My.sln","projects":["a.csproj","b.csproj"]}}';

    const result = parseSlnf(content);

    const first = result.projects[0]!.span!;
    expect(content.slice(first.offset, first.offset + first.length)).toBe('"a.csproj"');

    const second = result.projects[1]!.span!;
    expect(content.slice(second.offset, second.offset + second.length)).toBe('"b.csproj"');
  });

  it('records where the declared solution path sits', () => {
    const content = '{"solution":{"path":"..\\\\My.sln","projects":[]}}';

    const span = parseSlnf(content).solutionPathSpan!;

    expect(content.slice(span.offset, span.offset + span.length)).toBe('"..\\\\My.sln"');
  });

  it('keeps positions right when the file is indented over several lines', () => {
    const content = [
      '{',
      '  "solution": {',
      '    "path": "My.sln",',
      '    "projects": [',
      '      "src/A/A.csproj"',
      '    ]',
      '  }',
      '}',
    ].join('\n');

    const span = parseSlnf(content).projects[0]!.span!;

    expect(content.slice(span.offset, span.offset + span.length)).toBe('"src/A/A.csproj"');
  });

  it('gives no position for an entry it skipped', () => {
    const result = parseSlnf('{"solution":{"path":"My.sln","projects":[42,"a.csproj"]}}');

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]!.name).toBe('a');
  });
});
