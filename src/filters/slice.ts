import type { ProjectGraph } from '../model/projectGraph';
import type { SolutionModel } from '../model/types';
import { absoluteProjectPaths } from '../model/solutionReader';
import { comparePaths, pathKey } from '../model/paths';

export type MemberReason = 'chosen' | 'dependency' | 'coveringTest';

export interface SliceMember {
  /** Canonical absolute path, as the solution lists it. */
  absolutePath: string;
  reason: MemberReason;
  /** The chosen root that accounts for its presence. Absent for `chosen`. */
  via?: string;
}

export interface Slice {
  members: SliceMember[];
  /** Referenced but absent from the parent solution, so left out. */
  excludedOutsideSolution: string[];
  diagnostics: string[];
}

export interface SliceOptions {
  /** Add the test projects that cover the chosen projects. */
  includeTestProjects: boolean;
}

/**
 * Composes the slice a set of chosen projects entails, keeping for every member the
 * reason it is there.
 *
 * The forward closure of `ProjectReference` is mandatory: a filter missing a dependency
 * does not load. The result is intersected with the parent solution, because MSBuild
 * rejects a filter naming a project the solution does not contain (`MSB5028`) rather than
 * ignoring it.
 *
 * Tests are pulled in for the **chosen** projects only, never for the whole closure:
 * measured on a real 81-project solution, targeting the closure added 29 test projects for
 * a single application, which defeats the point of a filter.
 */
export async function composeSlice(
  solution: SolutionModel,
  chosenRoots: Iterable<string>,
  graph: ProjectGraph,
  options: SliceOptions,
): Promise<Slice> {
  const diagnostics: string[] = [];
  const solutionProjects = absoluteProjectPaths(solution);
  const inSolution = new Map(solutionProjects.map((project) => [pathKey(project), project]));

  /*
   * Roots deduplicated, brought back to their canonical form and sorted: attributing a
   * project several roots reach must not depend on the order of the clicks.
   */
  const roots = [...new Set([...chosenRoots].map(pathKey))]
    .map((key) => inSolution.get(key))
    .filter((project): project is string => project !== undefined)
    .sort(comparePaths);

  const members = new Map<string, SliceMember>();
  const excluded = new Set<string>();

  for (const root of roots) {
    members.set(pathKey(root), { absolutePath: root, reason: 'chosen' });
  }

  for (const root of roots) {
    for (const reached of await graph.closureOf(root)) {
      const canonical = inSolution.get(pathKey(reached));
      if (canonical === undefined) {
        excluded.add(reached);
        continue;
      }
      if (members.has(pathKey(canonical))) {
        continue;
      }
      members.set(pathKey(canonical), {
        absolutePath: canonical,
        reason: 'dependency',
        via: root,
      });
    }
  }

  if (excluded.size > 0) {
    diagnostics.push(
      `${excluded.size} referenced project(s) are not in ${solution.filePath} and were left out, ` +
        'because MSBuild rejects a filter that names them.',
    );
  }

  if (options.includeTestProjects && roots.length > 0) {
    const targets = new Set(roots);
    const candidates = solutionProjects.filter((project) => !members.has(pathKey(project)));

    for (const dependent of await graph.dependentsOf(candidates, targets)) {
      if (!(await graph.isTestProject(dependent))) {
        continue;
      }
      const closure = await graph.closureOf(dependent);
      const covered = roots.find((root) => closure.has(root));
      members.set(pathKey(dependent), {
        absolutePath: dependent,
        reason: 'coveringTest',
        ...(covered === undefined ? {} : { via: covered }),
      });
    }
  }

  return {
    members: [...members.values()].sort((left, right) =>
      comparePaths(left.absolutePath, right.absolutePath),
    ),
    excludedOutsideSolution: [...excluded].sort(comparePaths),
    diagnostics,
  };
}
