import { describe, expect, it } from 'vitest';
import { ProjectGraph } from '../src/model/projectGraph';
import { planFilter } from '../src/filters/planner';
import type { SolutionModel } from '../src/model/types';
import { abs, StubFiles } from './helpers';

const SOLUTION = abs('My.sln');
const WEB = abs('src', 'Web', 'Web.csproj');
const CORE = abs('src', 'Core', 'Core.csproj');
const OUTSIDE = abs('external', 'Outside', 'Outside.csproj');
const TESTS = abs('src', 'Web.Tests', 'Web.Tests.csproj');
const UNRELATED = abs('src', 'Other', 'Other.csproj');

function solution(relativePaths: string[]): SolutionModel {
  return {
    format: 'sln',
    filePath: SOLUTION,
    solutionPath: SOLUTION,
    projects: relativePaths.map((relativePath) => ({ name: relativePath, relativePath })),
    diagnostics: [],
  };
}

describe('planFilter', () => {
  it('includes the transitive dependencies of the selection', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['../Core/Core.csproj'] })
      .project(CORE)
      .project(UNRELATED);

    const plan = await planFilter(
      solution(['src/Web/Web.csproj', 'src/Core/Core.csproj', 'src/Other/Other.csproj']),
      [WEB],
      new ProjectGraph(files),
      { includeTestProjects: false },
    );

    expect(plan.projects).toEqual([CORE, WEB]);
  });

  /** MSBuild fails with MSB5028 rather than ignoring a project the solution lacks. */
  it('drops referenced projects that the solution does not contain', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['../../external/Outside/Outside.csproj'] })
      .project(OUTSIDE);

    const plan = await planFilter(solution(['src/Web/Web.csproj']), [WEB], new ProjectGraph(files), {
      includeTestProjects: false,
    });

    expect(plan.projects).toEqual([WEB]);
    expect(plan.excludedOutsideSolution).toEqual([OUTSIDE]);
    expect(plan.diagnostics).toHaveLength(1);
  });

  it('adds the test projects that cover the selection', async () => {
    const files = new StubFiles()
      .project(WEB)
      .project(TESTS, { references: ['../Web/Web.csproj'], packages: ['Microsoft.NET.Test.Sdk'] })
      .project(UNRELATED, { packages: ['Microsoft.NET.Test.Sdk'] });

    const plan = await planFilter(
      solution(['src/Web/Web.csproj', 'src/Web.Tests/Web.Tests.csproj', 'src/Other/Other.csproj']),
      [WEB],
      new ProjectGraph(files),
      { includeTestProjects: true },
    );

    expect(plan.projects).toEqual([TESTS, WEB]);
    expect(plan.addedTestProjects).toEqual([TESTS]);
  });

  /**
   * Regression: targeting the whole dependency closure added 29 test projects for a
   * single application on a real 81-project solution, because every test project
   * reaches the same shared kernel.
   */
  it('leaves out a test project that only shares a dependency with the selection', async () => {
    const shared = abs('src', 'Common', 'Common.csproj');
    const otherTests = abs('src', 'Other.Tests', 'Other.Tests.csproj');

    const files = new StubFiles()
      .project(WEB, { references: ['../Common/Common.csproj'] })
      .project(shared)
      .project(otherTests, {
        references: ['../Common/Common.csproj'],
        packages: ['Microsoft.NET.Test.Sdk'],
      });

    const plan = await planFilter(
      solution(['src/Web/Web.csproj', 'src/Common/Common.csproj', 'src/Other.Tests/Other.Tests.csproj']),
      [WEB],
      new ProjectGraph(files),
      { includeTestProjects: true },
    );

    expect(plan.projects).toEqual([shared, WEB]);
    expect(plan.addedTestProjects).toEqual([]);
  });

  it('leaves out a non-test project that references the selection', async () => {
    const files = new StubFiles().project(WEB).project(UNRELATED, { references: ['../Web/Web.csproj'] });

    const plan = await planFilter(
      solution(['src/Web/Web.csproj', 'src/Other/Other.csproj']),
      [WEB],
      new ProjectGraph(files),
      { includeTestProjects: true },
    );

    expect(plan.projects).toEqual([WEB]);
  });

  /**
   * A solution and a project file routinely disagree on the casing of a shared
   * directory. Matching them exactly would silently drop the dependency.
   */
  it('matches paths that differ only by case', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['../core/Core.csproj'] })
      .project(abs('src', 'core', 'Core.csproj'));

    const plan = await planFilter(
      solution(['src/Web/Web.csproj', 'src/Core/Core.csproj']),
      [WEB],
      new ProjectGraph(files),
      { includeTestProjects: false },
    );

    expect(plan.projects).toEqual([CORE, WEB]);
  });

  it('returns only the selection when it has no references', async () => {
    const files = new StubFiles().project(WEB);

    const plan = await planFilter(solution(['src/Web/Web.csproj']), [WEB], new ProjectGraph(files), {
      includeTestProjects: false,
    });

    expect(plan.projects).toEqual([WEB]);
    expect(plan.diagnostics).toEqual([]);
  });
});
