import { describe, expect, it } from 'vitest';
import { buildFilterContent } from '../src/filters/generator';
import { abs } from './helpers';

describe('buildFilterContent', () => {
  it('writes backslashes, as Visual Studio and Rider do', () => {
    const content = buildFilterContent({
      filterAbsolutePath: abs('Bff.slnf'),
      solutionAbsolutePath: abs('My.sln'),
      projectAbsolutePaths: [abs('src', 'Web', 'Web.csproj')],
    });

    expect(JSON.parse(content)).toEqual({
      solution: { path: 'My.sln', projects: ['src\\Web\\Web.csproj'] },
    });
  });

  it('expresses the solution relative to the filter and the projects relative to the solution', () => {
    const content = buildFilterContent({
      filterAbsolutePath: abs('filters', 'Bff.slnf'),
      solutionAbsolutePath: abs('My.sln'),
      projectAbsolutePaths: [abs('src', 'Web', 'Web.csproj')],
    });

    expect(JSON.parse(content)).toEqual({
      solution: { path: '..\\My.sln', projects: ['src\\Web\\Web.csproj'] },
    });
  });

  it('sorts projects so regenerating a filter produces no incidental diff', () => {
    const content = buildFilterContent({
      filterAbsolutePath: abs('Bff.slnf'),
      solutionAbsolutePath: abs('My.sln'),
      projectAbsolutePaths: [
        abs('src', 'zeta', 'Zeta.csproj'),
        abs('src', 'Alpha', 'Alpha.csproj'),
        abs('src', 'middle', 'Middle.csproj'),
      ],
    });

    expect(JSON.parse(content).solution.projects).toEqual([
      'src\\Alpha\\Alpha.csproj',
      'src\\middle\\Middle.csproj',
      'src\\zeta\\Zeta.csproj',
    ]);
  });

  it('ends with a newline so the file is well formed for git', () => {
    const content = buildFilterContent({
      filterAbsolutePath: abs('Bff.slnf'),
      solutionAbsolutePath: abs('My.sln'),
      projectAbsolutePaths: [],
    });

    expect(content.endsWith('\n')).toBe(true);
    expect(JSON.parse(content).solution.projects).toEqual([]);
  });
});
