import type { ParsedSolution, ProjectEntry } from './types';
import { toPosix } from './paths';

const SOLUTION_FOLDER_TYPE = '2150E333-8FDC-42A3-9474-1A3956D46DE8';

const PROJECT_LINE =
  /^Project\("\{([0-9A-Fa-f-]+)\}"\)\s*=\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"\{([0-9A-Fa-f-]+)\}"/;
const NESTED_LINE = /^\{([0-9A-Fa-f-]+)\}\s*=\s*\{([0-9A-Fa-f-]+)\}$/;

interface RawEntry {
  typeGuid: string;
  name: string;
  relativePath: string;
  guid: string;
}

/**
 * Parses the classic text `.sln` format: one `Project(...)` line per entry, plus a
 * `NestedProjects` global section mapping children to their solution folder.
 */
export function parseSln(content: string): ParsedSolution {
  const diagnostics: string[] = [];
  const entries = new Map<string, RawEntry>();
  const parents = new Map<string, string>();

  let inNestedSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith('GlobalSection(NestedProjects)')) {
      inNestedSection = true;
      continue;
    }
    if (inNestedSection) {
      if (line === 'EndGlobalSection') {
        inNestedSection = false;
        continue;
      }
      const nested = NESTED_LINE.exec(line);
      if (nested) {
        parents.set(nested[1]!.toUpperCase(), nested[2]!.toUpperCase());
      }
      continue;
    }

    const match = PROJECT_LINE.exec(line);
    if (!match) {
      continue;
    }
    const guid = match[4]!.toUpperCase();
    if (entries.has(guid)) {
      diagnostics.push(`Duplicate project GUID {${guid}}, keeping the first occurrence.`);
      continue;
    }
    entries.set(guid, {
      typeGuid: match[1]!.toUpperCase(),
      name: match[2]!,
      relativePath: toPosix(match[3]!),
      guid,
    });
  }

  const folderNames = new Map<string, string>();
  for (const entry of entries.values()) {
    if (entry.typeGuid === SOLUTION_FOLDER_TYPE) {
      folderNames.set(entry.guid, entry.name);
    }
  }

  const projects: ProjectEntry[] = [];
  for (const entry of entries.values()) {
    if (entry.typeGuid === SOLUTION_FOLDER_TYPE) {
      continue;
    }
    const folder = folderPathOf(entry.guid, parents, folderNames, diagnostics);
    projects.push({
      name: entry.name,
      relativePath: entry.relativePath,
      ...(folder === undefined ? {} : { folder }),
    });
  }

  return { projects, diagnostics };
}

/** Walks the parent chain up to the root, guarding against cycles in malformed files. */
function folderPathOf(
  guid: string,
  parents: Map<string, string>,
  folderNames: Map<string, string>,
  diagnostics: string[],
): string | undefined {
  const segments: string[] = [];
  const seen = new Set<string>([guid]);
  let current = parents.get(guid);

  while (current !== undefined) {
    if (seen.has(current)) {
      diagnostics.push(`Cycle in NestedProjects around {${current}}, folder path truncated.`);
      break;
    }
    seen.add(current);
    const name = folderNames.get(current);
    if (name === undefined) {
      break;
    }
    segments.unshift(name);
    current = parents.get(current);
  }

  return segments.length > 0 ? segments.join('/') : undefined;
}
