import type { ParsedSolution, ProjectEntry } from './types';
import { projectNameFromPath, toPosix } from './paths';

/**
 * Parses a `.slnf` solution filter:
 * `{ "solution": { "path": "...", "projects": ["..."] } }`.
 *
 * The two path kinds do not share a base directory, which is verified against the
 * .NET SDK rather than assumed: `solution.path` is relative to the filter file,
 * while every `projects` entry is relative to the *solution* directory. A filter
 * living in a subdirectory therefore uses `../My.sln` alongside `src/A/A.csproj`.
 * Both separators are accepted; Visual Studio and Rider write backslashes.
 */
export function parseSlnf(content: string): ParsedSolution {
  const diagnostics: string[] = [];
  let document: unknown;

  try {
    document = JSON.parse(content);
  } catch (error) {
    return { projects: [], diagnostics: [`Malformed JSON: ${describe(error)}`] };
  }

  const solution = isRecord(document) ? document['solution'] : undefined;
  if (!isRecord(solution)) {
    return { projects: [], diagnostics: ['No "solution" object.'] };
  }

  const rawSolutionPath = solution['path'];
  if (typeof rawSolutionPath !== 'string' || rawSolutionPath.trim() === '') {
    return { projects: [], diagnostics: ['No "solution.path" value.'] };
  }

  const rawProjects = solution['projects'];
  const projects: ProjectEntry[] = [];

  if (rawProjects === undefined) {
    diagnostics.push('No "solution.projects" array, the filter selects nothing.');
  } else if (!Array.isArray(rawProjects)) {
    diagnostics.push('"solution.projects" is not an array, ignored.');
  } else {
    for (const raw of rawProjects) {
      if (typeof raw !== 'string' || raw.trim() === '') {
        diagnostics.push('A "solution.projects" entry is not a path, skipped.');
        continue;
      }
      const relativePath = toPosix(raw.trim());
      projects.push({ name: projectNameFromPath(relativePath), relativePath });
    }
  }

  return {
    projects,
    diagnostics,
    solutionRelativePath: toPosix(rawSolutionPath.trim()),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
