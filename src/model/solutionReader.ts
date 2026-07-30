import * as path from 'node:path';
import type { FileReader, SolutionFormat, SolutionModel } from './types';
import { parseSln } from './slnParser';
import { parseSlnx } from './slnxParser';
import { parseSlnf } from './slnfParser';
import { resolveFromDir } from './paths';

export function formatOf(absolutePath: string): SolutionFormat | undefined {
  switch (path.extname(absolutePath).toLowerCase()) {
    case '.sln':
      return 'sln';
    case '.slnx':
      return 'slnx';
    case '.slnf':
      return 'slnf';
    default:
      return undefined;
  }
}

/**
 * The single seam every consumer goes through. Swapping the hand-written parsers for
 * a .NET companion binary later means reimplementing this function and nothing else.
 */
export async function readSolution(
  absolutePath: string,
  reader: FileReader,
): Promise<SolutionModel | undefined> {
  const format = formatOf(absolutePath);
  if (format === undefined) {
    return undefined;
  }

  const content = await reader.readFile(absolutePath);
  if (content === undefined) {
    return {
      format,
      filePath: absolutePath,
      solutionPath: absolutePath,
      projects: [],
      diagnostics: [`Cannot read ${absolutePath}.`],
    };
  }

  const parsed =
    format === 'sln' ? parseSln(content) : format === 'slnx' ? parseSlnx(content) : parseSlnf(content);

  let solutionPath = absolutePath;
  if (format === 'slnf') {
    if (parsed.solutionRelativePath === undefined) {
      return {
        format,
        filePath: absolutePath,
        solutionPath: absolutePath,
        projects: [],
        diagnostics: parsed.diagnostics,
      };
    }
    solutionPath = resolveFromDir(path.dirname(absolutePath), parsed.solutionRelativePath);
  }

  return {
    format,
    filePath: absolutePath,
    solutionPath,
    projects: parsed.projects,
    diagnostics: parsed.diagnostics,
    ...(parsed.solutionPathSpan === undefined
      ? {}
      : { solutionPathSpan: parsed.solutionPathSpan }),
  };
}

/** Absolute OS paths of every project in a model, resolved against its solution directory. */
export function absoluteProjectPaths(model: SolutionModel): string[] {
  const base = path.dirname(model.solutionPath);
  return model.projects.map((project) => resolveFromDir(base, project.relativePath));
}
