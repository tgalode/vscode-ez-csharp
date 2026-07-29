import * as path from 'node:path';
import { relativeFromDir, toWindows } from '../model/paths';

export interface FilterContentInput {
  /** Absolute path the filter will be written to. */
  filterAbsolutePath: string;
  /** Absolute path of the solution being filtered. */
  solutionAbsolutePath: string;
  /** Absolute paths of the projects to include. */
  projectAbsolutePaths: readonly string[];
}

/**
 * Renders a `.slnf` file.
 *
 * The two path bases differ and this is verified against the .NET SDK, not assumed:
 * `solution.path` is relative to the filter, while each project path is relative to
 * the solution. Separators are backslashes so the output is byte-comparable with what
 * Visual Studio and Rider write; the SDK accepts both on every OS.
 */
export function buildFilterContent(input: FilterContentInput): string {
  const filterDirectory = path.dirname(input.filterAbsolutePath);
  const solutionDirectory = path.dirname(input.solutionAbsolutePath);

  const solutionPath = relativeFromDir(filterDirectory, input.solutionAbsolutePath);
  const projects = input.projectAbsolutePaths
    .map((project) => relativeFromDir(solutionDirectory, project))
    .sort((left, right) => (left.toLowerCase() < right.toLowerCase() ? -1 : 1))
    .map(toWindows);

  const document = {
    solution: {
      path: toWindows(solutionPath),
      projects,
    },
  };

  return `${JSON.stringify(document, undefined, 2)}\n`;
}
