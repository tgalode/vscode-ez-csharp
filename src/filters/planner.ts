import type { ProjectGraph } from '../model/projectGraph';
import type { SolutionModel } from '../model/types';
import { composeSlice } from './slice';

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
 * A thin projection of composeSlice, which owns the closure rules: keeping two
 * implementations of them would let them drift apart.
 */
export async function planFilter(
  solution: SolutionModel,
  selected: Iterable<string>,
  graph: ProjectGraph,
  options: PlanOptions,
): Promise<FilterPlan> {
  const slice = await composeSlice(solution, selected, graph, options);

  return {
    projects: slice.members.map((member) => member.absolutePath),
    excludedOutsideSolution: slice.excludedOutsideSolution,
    addedTestProjects: slice.members
      .filter((member) => member.reason === 'coveringTest')
      .map((member) => member.absolutePath),
    diagnostics: slice.diagnostics,
  };
}
