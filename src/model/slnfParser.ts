import { findNodeAtLocation, parseTree, printParseErrorCode, type ParseError } from 'jsonc-parser';
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
 *
 * Parsing goes through jsonc-parser rather than JSON.parse so every value keeps the
 * offset it was read from, which is what lets a problem be reported on the line that
 * causes it instead of on the file as a whole.
 */
export function parseSlnf(content: string): ParsedSolution {
  const errors: ParseError[] = [];
  const root = parseTree(content, errors);

  if (root === undefined || errors.length > 0) {
    const first = errors[0];
    const reason =
      first === undefined
        ? 'no value found'
        : `${printParseErrorCode(first.error)} at offset ${first.offset}`;
    return { projects: [], diagnostics: [`Malformed JSON: ${reason}.`] };
  }

  const solution = findNodeAtLocation(root, ['solution']);
  if (solution === undefined || solution.type !== 'object') {
    return { projects: [], diagnostics: ['No "solution" object.'] };
  }

  const pathNode = findNodeAtLocation(solution, ['path']);
  if (pathNode === undefined || typeof pathNode.value !== 'string' || pathNode.value.trim() === '') {
    return { projects: [], diagnostics: ['No "solution.path" value.'] };
  }

  const diagnostics: string[] = [];
  const projects: ProjectEntry[] = [];
  const projectsNode = findNodeAtLocation(solution, ['projects']);

  if (projectsNode === undefined) {
    diagnostics.push('No "solution.projects" array, the filter selects nothing.');
  } else if (projectsNode.type !== 'array') {
    diagnostics.push('"solution.projects" is not an array, ignored.');
  } else {
    for (const child of projectsNode.children ?? []) {
      const raw: unknown = child.value;
      if (typeof raw !== 'string' || raw.trim() === '') {
        diagnostics.push('A "solution.projects" entry is not a path, skipped.');
        continue;
      }
      const relativePath = toPosix(raw.trim());
      projects.push({
        name: projectNameFromPath(relativePath),
        relativePath,
        span: { offset: child.offset, length: child.length },
      });
    }
  }

  return {
    projects,
    diagnostics,
    solutionRelativePath: toPosix(pathNode.value.trim()),
    solutionPathSpan: { offset: pathNode.offset, length: pathNode.length },
  };
}
