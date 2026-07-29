import { describe, expect, it } from 'vitest';
import { ProjectGraph } from '../src/model/projectGraph';
import { abs, StubFiles } from './helpers';

const WEB = abs('src', 'Web', 'Web.csproj');
const CORE = abs('src', 'Core', 'Core.csproj');
const COMMON = abs('src', 'Common', 'Common.csproj');
const TESTS = abs('src', 'Web.Tests', 'Web.Tests.csproj');

describe('ProjectGraph', () => {
  it('follows references transitively', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['..\\Core\\Core.csproj'] })
      .project(CORE, { references: ['../Common/Common.csproj'] })
      .project(COMMON);

    const closure = await new ProjectGraph(files).closureOf(WEB);

    expect([...closure].sort()).toEqual([COMMON, CORE, WEB].sort());
  });

  it('terminates on a reference cycle', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['../Core/Core.csproj'] })
      .project(CORE, { references: ['../Web/Web.csproj'] });

    const closure = await new ProjectGraph(files).closureOf(WEB);

    expect([...closure].sort()).toEqual([CORE, WEB].sort());
  });

  it('reports an unreadable project instead of failing the whole walk', async () => {
    const files = new StubFiles().project(WEB, { references: ['../Gone/Gone.csproj'] });
    const graph = new ProjectGraph(files);

    const closure = await graph.closureOf(WEB);

    expect(closure.has(WEB)).toBe(true);
    expect(graph.diagnostics.some((entry) => entry.includes('Cannot read'))).toBe(true);
  });

  it('splits a semicolon-separated Include and reports wildcards', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['../Core/Core.csproj;../Common/Common.csproj', '../*/Any.csproj'] })
      .project(CORE)
      .project(COMMON);
    const graph = new ProjectGraph(files);

    const references = await graph.referencesOf(WEB);

    expect(references.sort()).toEqual([COMMON, CORE].sort());
    expect(graph.diagnostics.some((entry) => entry.includes('Wildcard'))).toBe(true);
  });

  it('finds the projects that reach a target', async () => {
    const files = new StubFiles()
      .project(WEB, { references: ['../Core/Core.csproj'] })
      .project(CORE)
      .project(TESTS, { references: ['../Web/Web.csproj'] });

    const dependents = await new ProjectGraph(files).dependentsOf([TESTS, CORE], new Set([WEB]));

    expect(dependents).toEqual([TESTS]);
  });

  it('recognizes a test project by its test platform package', async () => {
    const files = new StubFiles()
      .project(TESTS, { packages: ['NUnit', 'Microsoft.NET.Test.Sdk'] })
      .project(CORE, { packages: ['NUnit'] });
    const graph = new ProjectGraph(files);

    expect(await graph.isTestProject(TESTS)).toBe(true);
    expect(await graph.isTestProject(CORE)).toBe(false);
  });

  it('recognizes a test project declared through IsTestProject', async () => {
    const files = new StubFiles().project(CORE, { isTestProject: true });

    expect(await new ProjectGraph(files).isTestProject(CORE)).toBe(true);
  });

  it('falls back to the project name when no marker is present', async () => {
    const named = abs('src', 'Thing.Tests', 'Thing.Tests.csproj');
    const files = new StubFiles().project(named).project(CORE);
    const graph = new ProjectGraph(files);

    expect(await graph.isTestProject(named)).toBe(true);
    expect(await graph.isTestProject(CORE)).toBe(false);
  });
});
