import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ParsedSolution, ProjectEntry } from './types';
import { projectNameFromPath, toPosix } from './paths';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (name) => name === 'Project' || name === 'Folder',
});

/**
 * Parses the XML `.slnx` format introduced in .NET 9.0.200 and made the default by
 * `dotnet new sln` in .NET 10. Folders carry their full path in `Name` (`/A/B/`),
 * so nesting needs no parent resolution.
 */
export function parseSlnx(content: string): ParsedSolution {
  const diagnostics: string[] = [];

  // The parser is lenient and happily accepts an unclosed element, so a malformed file
  // would otherwise yield partial results with no warning. Validating first reports the
  // problem while still returning whatever could be recovered.
  const validation = XMLValidator.validate(content);
  if (validation !== true) {
    diagnostics.push(`Malformed XML: ${validation.err.msg} (line ${validation.err.line}).`);
  }

  let document: unknown;
  try {
    document = parser.parse(content);
  } catch (error) {
    diagnostics.push(`Cannot parse XML: ${describe(error)}`);
    return { projects: [], diagnostics };
  }

  const solution = isRecord(document) ? document['Solution'] : undefined;
  if (!isRecord(solution)) {
    diagnostics.push('No <Solution> root element.');
    return { projects: [], diagnostics };
  }

  const projects: ProjectEntry[] = [];

  for (const project of asArray(solution['Project'])) {
    const entry = toEntry(project, undefined, diagnostics);
    if (entry) {
      projects.push(entry);
    }
  }

  for (const folder of asArray(solution['Folder'])) {
    if (!isRecord(folder)) {
      continue;
    }
    const folderPath = normalizeFolderName(folder['@Name']);
    for (const project of asArray(folder['Project'])) {
      const entry = toEntry(project, folderPath, diagnostics);
      if (entry) {
        projects.push(entry);
      }
    }
  }

  return { projects, diagnostics };
}

function toEntry(
  project: unknown,
  folder: string | undefined,
  diagnostics: string[],
): ProjectEntry | undefined {
  // An element with no attributes, `<Project />`, parses to an empty string rather
  // than an object, so a non-record node is a Project without a Path, not a non-Project.
  const rawPath = isRecord(project) ? project['@Path'] : undefined;
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    diagnostics.push('A <Project> element has no Path attribute, skipped.');
    return undefined;
  }
  const relativePath = toPosix(rawPath.trim());
  return {
    name: projectNameFromPath(relativePath),
    relativePath,
    ...(folder === undefined ? {} : { folder }),
  };
}

/** `/1 - Libs/Common/` -> `1 - Libs/Common` */
function normalizeFolderName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = toPosix(raw).replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? undefined : trimmed;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
