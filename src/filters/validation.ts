import type { SolutionModel, TextSpan } from '../model/types';
import { absoluteProjectPaths } from '../model/solutionReader';

export interface FilterProblem {
  /**
   * `missingFromSolution` fails the build with MSB5028, so the filter does not load at
   * all. `missingOnDisk` is a working copy problem the parent solution shares.
   */
  kind: 'missingFromSolution' | 'missingOnDisk';
  absolutePath: string;
  /** Where the offending entry sits in the filter, when its source knows. */
  span?: TextSpan;
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
): Promise<FilterProblem[]> {
  const solutionProjects = new Set(absoluteProjectPaths(solution).map((p) => p.toLowerCase()));
  const problems: FilterProblem[] = [];

  // absoluteProjectPaths maps model.projects in order, so an index addresses both the
  // resolved path and the entry it came from.
  const resolved = absoluteProjectPaths(filter);

  for (const [index, project] of resolved.entries()) {
    const span = filter.projects[index]?.span;
    const at = span === undefined ? {} : { span };

    if (!solutionProjects.has(project.toLowerCase())) {
      problems.push({ kind: 'missingFromSolution', absolutePath: project, ...at });
      continue;
    }
    if (!(await probe.exists(project))) {
      problems.push({ kind: 'missingOnDisk', absolutePath: project, ...at });
    }
  }

  return problems;
}
