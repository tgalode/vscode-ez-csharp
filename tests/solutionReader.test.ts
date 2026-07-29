import { describe, expect, it } from 'vitest';
import { absoluteProjectPaths, formatOf, readSolution } from '../src/model/solutionReader';
import { abs, StubFiles } from './helpers';

describe('formatOf', () => {
  it('recognizes the three solution formats, case-insensitively', () => {
    expect(formatOf('/a/My.SLN')).toBe('sln');
    expect(formatOf('/a/My.slnx')).toBe('slnx');
    expect(formatOf('/a/My.slnf')).toBe('slnf');
    expect(formatOf('/a/My.csproj')).toBeUndefined();
  });
});

describe('readSolution', () => {
  it('reports an unreadable file as a diagnostic rather than throwing', async () => {
    const model = await readSolution(abs('Missing.sln'), new StubFiles());

    expect(model?.projects).toEqual([]);
    expect(model?.diagnostics[0]).toContain('Cannot read');
  });

  it('resolves the solution of a filter relative to the filter itself', async () => {
    const files = new StubFiles().set(
      abs('filters', 'Bff.slnf'),
      JSON.stringify({ solution: { path: '..\\My.sln', projects: ['src\\A\\A.csproj'] } }),
    );

    const model = await readSolution(abs('filters', 'Bff.slnf'), files);

    expect(model?.solutionPath).toBe(abs('My.sln'));
  });

  /**
   * The asymmetry verified against the .NET SDK: `solution.path` is relative to the
   * filter, project paths are relative to the solution. Reading both from the same
   * base is the mistake this test exists to catch.
   */
  it('resolves the projects of a filter relative to the solution, not the filter', async () => {
    const files = new StubFiles().set(
      abs('filters', 'Bff.slnf'),
      JSON.stringify({ solution: { path: '..\\My.sln', projects: ['src\\A\\A.csproj'] } }),
    );

    const model = await readSolution(abs('filters', 'Bff.slnf'), files);

    expect(absoluteProjectPaths(model!)).toEqual([abs('src', 'A', 'A.csproj')]);
  });

  it('resolves the projects of a solution relative to itself', async () => {
    const files = new StubFiles().set(
      abs('My.slnx'),
      '<Solution><Project Path="src/A/A.csproj" /></Solution>',
    );

    const model = await readSolution(abs('My.slnx'), files);

    expect(model?.solutionPath).toBe(abs('My.slnx'));
    expect(absoluteProjectPaths(model!)).toEqual([abs('src', 'A', 'A.csproj')]);
  });

  it('reports a filter whose solution path is missing', async () => {
    const files = new StubFiles().set(abs('Bad.slnf'), '{}');

    const model = await readSolution(abs('Bad.slnf'), files);

    expect(model?.projects).toEqual([]);
    expect(model?.diagnostics).toEqual(['No "solution" object.']);
  });
});
