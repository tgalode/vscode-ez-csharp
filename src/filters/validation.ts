import type { SolutionModel } from '../model/types';
import { absoluteProjectPaths } from '../model/solutionReader';

export interface FilterProblems {
  /** Listed by the filter but absent from the parent solution. Fails the build with MSB5028. */
  missingFromSolution: string[];
  /** Listed by the filter and present in the solution, but no file on disk. */
  missingOnDisk: string[];
}

export interface ExistenceProbe {
  exists(absolutePath: string): Promise<boolean>;
}

/**
 * Explains why a filter will not load, before the language server fails without a
 * usable message. The two causes are distinct: MSBuild rejects a project the parent
 * solution does not list, independently of whether the file exists.
 */
export async function validateFilter(
  filter: SolutionModel,
  solution: SolutionModel,
  probe: ExistenceProbe,
): Promise<FilterProblems> {
  const solutionProjects = new Set(absoluteProjectPaths(solution).map((p) => p.toLowerCase()));

  const missingFromSolution: string[] = [];
  const missingOnDisk: string[] = [];

  for (const project of absoluteProjectPaths(filter)) {
    if (!solutionProjects.has(project.toLowerCase())) {
      missingFromSolution.push(project);
      continue;
    }
    if (!(await probe.exists(project))) {
      missingOnDisk.push(project);
    }
  }

  return { missingFromSolution, missingOnDisk };
}
