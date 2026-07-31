import { describe, expect, it } from 'vitest';
import { buildSliceTree, type SliceNode } from '../src/filters/sliceTree';
import type { Slice } from '../src/filters/slice';
import type { ProjectEntry, SolutionModel } from '../src/model/types';
import { abs } from './helpers';

const SOLUTION = abs('My.sln');
const EMPTY: Slice = { members: [], excludedOutsideSolution: [], diagnostics: [] };

function solution(projects: ProjectEntry[]): SolutionModel {
  return {
    format: 'sln',
    filePath: SOLUTION,
    solutionPath: SOLUTION,
    projects,
    diagnostics: [],
  };
}

/** Étiquettes de l'arbre, indentées, pour comparer une forme d'un coup d'œil. */
function shape(nodes: readonly SliceNode[], depth = 0): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder'
      ? ['  '.repeat(depth) + node.label + '/', ...shape(node.children, depth + 1)]
      : ['  '.repeat(depth) + node.label],
  );
}

describe('buildSliceTree', () => {
  it('rend un arbre plat quand la solution ne déclare aucun dossier', () => {
    const nodes = buildSliceTree(
      solution([
        { name: 'B', relativePath: 'B/B.csproj' },
        { name: 'A', relativePath: 'A/A.csproj' },
      ]),
      EMPTY,
      new Set(),
    );

    expect(shape(nodes)).toEqual(['A', 'B']);
  });

  it('reconstruit les dossiers imbriqués, découpés sur les slashs', () => {
    const nodes = buildSliceTree(
      solution([
        { name: 'Core', relativePath: 'Core/Core.csproj', folder: '1 - Libs/Core' },
        { name: 'App', relativePath: 'App/App.csproj', folder: 'src' },
        { name: 'Loose', relativePath: 'Loose/Loose.csproj' },
      ]),
      EMPTY,
      new Set(),
    );

    expect(shape(nodes)).toEqual(['1 - Libs/', '  Core/', '    Core', 'src/', '  App', 'Loose']);
  });

  it('montre tous les projets de la solution, membres de la tranche ou non', () => {
    const nodes = buildSliceTree(
      solution([
        { name: 'A', relativePath: 'A/A.csproj' },
        { name: 'B', relativePath: 'B/B.csproj' },
      ]),
      {
        members: [{ absolutePath: abs('A', 'A.csproj'), reason: 'chosen' }],
        excludedOutsideSolution: [],
        diagnostics: [],
      },
      new Set([abs('A', 'A.csproj').toLowerCase()]),
    );

    const projects = nodes.filter((node) => node.kind === 'project');
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({ label: 'A', chosen: true });
    expect(projects[0]).toHaveProperty('member.reason', 'chosen');
    expect(projects[1]).toMatchObject({ label: 'B', chosen: false });
    expect(projects[1]!.kind === 'project' && projects[1]!.member).toBeUndefined();
  });

  it('coche selon les racines choisies, pas selon l\'appartenance', () => {
    const nodes = buildSliceTree(
      solution([{ name: 'Core', relativePath: 'Core/Core.csproj' }]),
      {
        members: [
          {
            absolutePath: abs('Core', 'Core.csproj'),
            reason: 'dependency',
            via: abs('App', 'App.csproj'),
          },
        ],
        excludedOutsideSolution: [],
        diagnostics: [],
      },
      new Set(),
    );

    const core = nodes[0];
    expect(core).toMatchObject({ kind: 'project', chosen: false });
    expect(core).toHaveProperty('member.reason', 'dependency');
  });
});
