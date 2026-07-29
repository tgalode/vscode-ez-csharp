import type { ProjectGraph } from '../model/projectGraph';
import type { SolutionModel } from '../model/types';
import { absoluteProjectPaths } from '../model/solutionReader';

export interface PlanOptions {
  /** Pull in test projects that reference the selection, so the filter stays testable. */
  includeTestProjects: boolean;
}

export interface FilterPlan {
  /** Absolute OS paths to write into the filter, sorted. */
  projects: string[];
  /** Referenced projects dropped because the parent solution does not list them. */
  excludedOutsideSolution: string[];
  /** Test projects added by the reverse closure. */
  addedTestProjects: string[];
  diagnostics: string[];
}

/**
 * Turns a project selection into the set of projects a filter must contain.
 *
 * The forward closure of `ProjectReference` is mandatory: a filter missing a
 * dependency does not load. The result is then intersected with the parent
 * solution, because MSBuild rejects a filter naming a project the solution does not
 * contain (`MSB5028`) rather than ignoring it.
 */
export async function planFilter(
  solution: SolutionModel,
  selected: Iterable<string>,
  graph: ProjectGraph,
  options: PlanOptions,
): Promise<FilterPlan> {
  const diagnostics: string[] = [];
  const solutionProjects = absoluteProjectPaths(solution);
  const inSolution = new Map(solutionProjects.map((project) => [key(project), project]));

  const roots = [...selected];
  const closure = await graph.closureOfAll(roots);

  const kept = new Map<string, string>();
  const excludedOutsideSolution: string[] = [];

  for (const project of closure) {
    const canonical = inSolution.get(key(project));
    if (canonical === undefined) {
      excludedOutsideSolution.push(project);
    } else {
      kept.set(key(canonical), canonical);
    }
  }

  if (excludedOutsideSolution.length > 0) {
    diagnostics.push(
      `${excludedOutsideSolution.length} referenced project(s) are not in ${solution.filePath} and were left out, ` +
        'because MSBuild rejects a filter that names them.',
    );
  }

  const addedTestProjects: string[] = [];

  if (options.includeTestProjects) {
    /*
     * Only tests that cover the selected projects are wanted, not tests that merely
     * share a dependency with them. Targeting the whole closure instead pulls in
     * nearly every test project of a repository, because they all reach the same
     * shared kernel: measured on a real 81-project solution, it added 29 test
     * projects for a single selected application, which defeats the point of a filter.
     */
    const targets = new Set<string>();
    for (const root of roots) {
      const canonical = inSolution.get(key(root));
      if (canonical !== undefined) {
        targets.add(canonical);
      }
    }

    const candidates = solutionProjects.filter((project) => !kept.has(key(project)));
    const dependents = await graph.dependentsOf(candidates, targets);
    for (const dependent of dependents) {
      if (await graph.isTestProject(dependent)) {
        addedTestProjects.push(dependent);
        kept.set(key(dependent), dependent);
      }
    }
  }

  return {
    projects: [...kept.values()].sort(compareIgnoringCase),
    excludedOutsideSolution: excludedOutsideSolution.sort(compareIgnoringCase),
    addedTestProjects: addedTestProjects.sort(compareIgnoringCase),
    diagnostics,
  };
}

/**
 * Paths are matched case-insensitively. A solution and a project file routinely
 * disagree on the casing of a shared directory, and on macOS and Windows they still
 * name the same file. Treating them as distinct would silently drop a dependency,
 * which is a worse failure than conflating two paths that differ only by case.
 */
function key(absolutePath: string): string {
  return absolutePath.toLowerCase();
}

function compareIgnoringCase(left: string, right: string): number {
  return key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0;
}
