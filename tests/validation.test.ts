import { describe, expect, it } from 'vitest';
import { validateFilter } from '../src/filters/validation';
import type { SolutionModel } from '../src/model/types';
import { abs, StubFiles } from './helpers';

const SOLUTION = abs('My.sln');

function model(format: SolutionModel['format'], relativePaths: string[]): SolutionModel {
  return {
    format,
    filePath: format === 'slnf' ? abs('Bff.slnf') : SOLUTION,
    solutionPath: SOLUTION,
    projects: relativePaths.map((relativePath) => ({ name: relativePath, relativePath })),
    diagnostics: [],
  };
}

describe('validateFilter', () => {
  it('accepts a filter whose projects are in the solution and on disk', async () => {
    const files = new StubFiles().project(abs('src', 'Web', 'Web.csproj'));

    const problems = await validateFilter(
      model('slnf', ['src/Web/Web.csproj']),
      model('sln', ['src/Web/Web.csproj']),
      files,
    );

    expect(problems).toEqual({ missingFromSolution: [], missingOnDisk: [] });
  });

  it('flags a project the solution does not list, which is what MSB5028 reports', async () => {
    const files = new StubFiles().project(abs('src', 'Ghost', 'Ghost.csproj'));

    const problems = await validateFilter(
      model('slnf', ['src/Ghost/Ghost.csproj']),
      model('sln', ['src/Web/Web.csproj']),
      files,
    );

    expect(problems.missingFromSolution).toEqual([abs('src', 'Ghost', 'Ghost.csproj')]);
    expect(problems.missingOnDisk).toEqual([]);
  });

  it('flags a project listed by both but absent from disk', async () => {
    const problems = await validateFilter(
      model('slnf', ['src/Web/Web.csproj']),
      model('sln', ['src/Web/Web.csproj']),
      new StubFiles(),
    );

    expect(problems.missingFromSolution).toEqual([]);
    expect(problems.missingOnDisk).toEqual([abs('src', 'Web', 'Web.csproj')]);
  });
});
