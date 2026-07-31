import { describe, expect, it } from 'vitest';
import { composeSlice } from '../src/filters/slice';
import { ProjectGraph } from '../src/model/projectGraph';
import type { SolutionModel } from '../src/model/types';
import { abs, StubFiles } from './helpers';

const SOLUTION = abs('My.sln');

function solution(relativePaths: string[]): SolutionModel {
  return {
    format: 'sln',
    filePath: SOLUTION,
    solutionPath: SOLUTION,
    projects: relativePaths.map((relativePath) => ({ name: relativePath, relativePath })),
    diagnostics: [],
  };
}

/** App -> Core, Extra -> Core, Tests -> App. Tout est dans la solution. */
function repository(): { files: StubFiles; model: SolutionModel } {
  const files = new StubFiles()
    .project(abs('App', 'App.csproj'), { references: ['../Core/Core.csproj'] })
    .project(abs('Extra', 'Extra.csproj'), { references: ['../Core/Core.csproj'] })
    .project(abs('Core', 'Core.csproj'))
    .project(abs('App.Tests', 'App.Tests.csproj'), {
      references: ['../App/App.csproj'],
      packages: ['Microsoft.NET.Test.Sdk'],
    })
    .project(abs('Core.Tests', 'Core.Tests.csproj'), {
      references: ['../Core/Core.csproj'],
      packages: ['Microsoft.NET.Test.Sdk'],
    });

  return {
    files,
    model: solution([
      'App/App.csproj',
      'Extra/Extra.csproj',
      'Core/Core.csproj',
      'App.Tests/App.Tests.csproj',
      'Core.Tests/Core.Tests.csproj',
    ]),
  };
}

describe('composeSlice', () => {
  it('rend une tranche vide quand aucune racine n\'est choisie', async () => {
    const { files, model } = repository();

    const slice = await composeSlice(model, [], new ProjectGraph(files), {
      includeTestProjects: true,
    });

    expect(slice.members).toEqual([]);
    expect(slice.excludedOutsideSolution).toEqual([]);
  });

  it('dit pourquoi chaque membre est là', async () => {
    const { files, model } = repository();

    const slice = await composeSlice(model, [abs('App', 'App.csproj')], new ProjectGraph(files), {
      includeTestProjects: true,
    });

    // `App.Tests` précède `App` : un point trie avant un séparateur de chemin.
    expect(
      slice.members.map((member) => [member.absolutePath, member.reason, member.via]),
    ).toEqual([
      [abs('App.Tests', 'App.Tests.csproj'), 'coveringTest', abs('App', 'App.csproj')],
      [abs('App', 'App.csproj'), 'chosen', undefined],
      [abs('Core', 'Core.csproj'), 'dependency', abs('App', 'App.csproj')],
    ]);
  });

  it('n\'ajoute que les tests couvrant les projets choisis', async () => {
    const { files, model } = repository();

    const slice = await composeSlice(model, [abs('App', 'App.csproj')], new ProjectGraph(files), {
      includeTestProjects: true,
    });

    expect(slice.members.map((member) => member.absolutePath)).not.toContain(
      abs('Core.Tests', 'Core.Tests.csproj'),
    );
  });

  it('promouvoir un projet entraîné en racine rappelle ses tests', async () => {
    const { files, model } = repository();

    const slice = await composeSlice(
      model,
      [abs('App', 'App.csproj'), abs('Core', 'Core.csproj')],
      new ProjectGraph(files),
      { includeTestProjects: true },
    );

    const core = slice.members.find((member) => member.absolutePath === abs('Core', 'Core.csproj'));
    expect(core?.reason).toBe('chosen');
    expect(slice.members.map((member) => member.absolutePath)).toContain(
      abs('Core.Tests', 'Core.Tests.csproj'),
    );
  });

  it('attribue un projet atteint par plusieurs racines de façon déterministe', async () => {
    const { files, model } = repository();
    const roots = [abs('Extra', 'Extra.csproj'), abs('App', 'App.csproj')];

    const inOneOrder = await composeSlice(model, roots, new ProjectGraph(files), {
      includeTestProjects: false,
    });
    const inTheOther = await composeSlice(model, [...roots].reverse(), new ProjectGraph(files), {
      includeTestProjects: false,
    });

    const coreOf = (slice: Awaited<ReturnType<typeof composeSlice>>): string | undefined =>
      slice.members.find((member) => member.absolutePath === abs('Core', 'Core.csproj'))?.via;

    // App vient avant Extra dans l'ordre des chemins, donc c'est lui qui est cité.
    expect(coreOf(inOneOrder)).toBe(abs('App', 'App.csproj'));
    expect(coreOf(inTheOther)).toBe(abs('App', 'App.csproj'));
  });

  it('écarte un projet référencé que la solution ne liste pas, et le dit', async () => {
    const files = new StubFiles()
      .project(abs('App', 'App.csproj'), { references: ['../Ghost/Ghost.csproj'] })
      .project(abs('Ghost', 'Ghost.csproj'));

    const slice = await composeSlice(
      solution(['App/App.csproj']),
      [abs('App', 'App.csproj')],
      new ProjectGraph(files),
      { includeTestProjects: false },
    );

    expect(slice.members.map((member) => member.absolutePath)).toEqual([abs('App', 'App.csproj')]);
    expect(slice.excludedOutsideSolution).toEqual([abs('Ghost', 'Ghost.csproj')]);
    expect(slice.diagnostics).toHaveLength(1);
  });

  it('ignore une racine que la solution ne contient pas', async () => {
    const { files, model } = repository();

    const slice = await composeSlice(model, [abs('Nope', 'Nope.csproj')], new ProjectGraph(files), {
      includeTestProjects: true,
    });

    expect(slice.members).toEqual([]);
  });
});
