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

/** Same as `model`, with a position on every entry, as the `.slnf` parser produces. */
function positioned(relativePaths: string[]): SolutionModel {
  const base = model('slnf', relativePaths);
  return {
    ...base,
    projects: base.projects.map((project, index) => ({
      ...project,
      span: { offset: 100 + index * 10, length: 5 },
    })),
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

    expect(problems).toEqual([]);
  });

  it('flags a project the solution does not list, which is what MSB5028 reports', async () => {
    const files = new StubFiles().project(abs('src', 'Ghost', 'Ghost.csproj'));

    const problems = await validateFilter(
      model('slnf', ['src/Ghost/Ghost.csproj']),
      model('sln', ['src/Web/Web.csproj']),
      files,
    );

    expect(problems).toEqual([
      { kind: 'missingFromSolution', absolutePath: abs('src', 'Ghost', 'Ghost.csproj') },
    ]);
  });

  it('flags a project listed by both but absent from disk', async () => {
    const problems = await validateFilter(
      model('slnf', ['src/Web/Web.csproj']),
      model('sln', ['src/Web/Web.csproj']),
      new StubFiles(),
    );

    expect(problems).toEqual([
      { kind: 'missingOnDisk', absolutePath: abs('src', 'Web', 'Web.csproj') },
    ]);
  });

  it('carries the position of the entry that caused each problem', async () => {
    const problems = await validateFilter(
      positioned(['src/Ghost/Ghost.csproj', 'src/Other/Other.csproj']),
      model('sln', []),
      new StubFiles(),
    );

    expect(problems.map((problem) => problem.span)).toEqual([
      { offset: 100, length: 5 },
      { offset: 110, length: 5 },
    ]);
  });

  it('works on a model that has no positions at all', async () => {
    const problems = await validateFilter(
      model('slnf', ['src/Ghost/Ghost.csproj']),
      model('sln', []),
      new StubFiles(),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]!.span).toBeUndefined();
  });
});
