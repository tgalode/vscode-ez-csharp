import * as path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { FileReader } from './types';
import { projectNameFromPath, toPosix } from './paths';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

/** Packages that only ever appear in a project meant to be executed as tests. */
const TEST_PACKAGE_MARKERS = [
  'Microsoft.NET.Test.Sdk',
  'Microsoft.Testing.Platform',
  'Microsoft.Testing.Extensions.TestingPlatform.MSBuild',
];

const TEST_NAME_PATTERN = /(^|\.)(tests?|specs?|unittests?|integrationtests?)$/i;

/**
 * Resolves `ProjectReference` edges between MSBuild projects and classifies test
 * projects.
 *
 * Every project file is read and parsed at most once: the reverse closure walks the
 * whole solution, and a monolith holds dozens of projects.
 */
export class ProjectGraph {
  private readonly documents = new Map<string, unknown>();
  private readonly references = new Map<string, string[]>();
  private readonly closures = new Map<string, Set<string>>();
  readonly diagnostics: string[] = [];

  constructor(private readonly reader: FileReader) {}

  /** Direct `ProjectReference` targets of a project, as absolute OS paths. */
  async referencesOf(projectAbsolutePath: string): Promise<string[]> {
    const cached = this.references.get(projectAbsolutePath);
    if (cached !== undefined) {
      return cached;
    }

    const document = await this.documentOf(projectAbsolutePath);
    const raw: string[] = [];
    collectAttributes(document, 'ProjectReference', '@Include', raw);

    const directory = path.dirname(projectAbsolutePath);
    const resolved: string[] = [];

    for (const entry of raw) {
      for (const part of entry.split(';')) {
        const value = part.trim();
        if (value === '') {
          continue;
        }
        if (value.includes('*')) {
          this.diagnostics.push(
            `Wildcard ProjectReference "${value}" in ${projectAbsolutePath} is not expanded.`,
          );
          continue;
        }
        resolved.push(path.resolve(directory, toPosix(value)));
      }
    }

    this.references.set(projectAbsolutePath, resolved);
    return resolved;
  }

  /**
   * Every project reachable from `root`, including itself. Safe on cyclic graphs,
   * which do occur in neglected repositories.
   */
  async closureOf(root: string): Promise<Set<string>> {
    const cached = this.closures.get(root);
    if (cached !== undefined) {
      return cached;
    }

    const visited = new Set<string>();
    const pending = [root];

    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      pending.push(...(await this.referencesOf(current)));
    }

    this.closures.set(root, visited);
    return visited;
  }

  /** Union of the closures of several roots. */
  async closureOfAll(roots: Iterable<string>): Promise<Set<string>> {
    const union = new Set<string>();
    for (const root of roots) {
      for (const project of await this.closureOf(root)) {
        union.add(project);
      }
    }
    return union;
  }

  /**
   * Reverse closure: candidates that reach at least one target. This is what keeps a
   * generated filter usable for running tests, since a test project is never pulled
   * in by the code it tests.
   */
  async dependentsOf(candidates: Iterable<string>, targets: Set<string>): Promise<string[]> {
    const dependents: string[] = [];
    for (const candidate of candidates) {
      if (targets.has(candidate)) {
        continue;
      }
      const closure = await this.closureOf(candidate);
      for (const project of closure) {
        if (project !== candidate && targets.has(project)) {
          dependents.push(candidate);
          break;
        }
      }
    }
    return dependents;
  }

  /**
   * A project is treated as a test project when it pulls in a test platform, which is
   * the only reliable signal. The name is a fallback for repositories that declare the
   * test packages in a shared `Directory.Build.props` instead of the project file.
   */
  async isTestProject(projectAbsolutePath: string): Promise<boolean> {
    const document = await this.documentOf(projectAbsolutePath);

    const packages: string[] = [];
    collectAttributes(document, 'PackageReference', '@Include', packages);
    if (packages.some((name) => TEST_PACKAGE_MARKERS.includes(name.trim()))) {
      return true;
    }

    const flags: string[] = [];
    collectValues(document, 'IsTestProject', flags);
    if (flags.some((value) => value.trim().toLowerCase() === 'true')) {
      return true;
    }

    return TEST_NAME_PATTERN.test(projectNameFromPath(projectAbsolutePath));
  }

  private async documentOf(projectAbsolutePath: string): Promise<unknown> {
    const cached = this.documents.get(projectAbsolutePath);
    if (cached !== undefined) {
      return cached;
    }

    const content = await this.reader.readFile(projectAbsolutePath);
    if (content === undefined) {
      this.diagnostics.push(`Cannot read ${projectAbsolutePath}, treated as having no references.`);
      this.documents.set(projectAbsolutePath, {});
      return {};
    }

    let document: unknown;
    try {
      document = parser.parse(content);
    } catch (error) {
      this.diagnostics.push(
        `Malformed XML in ${projectAbsolutePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      document = {};
    }

    this.documents.set(projectAbsolutePath, document);
    return document;
  }
}

/** Collects an attribute of every `element` at any depth. Comments are dropped by the parser. */
function collectAttributes(node: unknown, element: string, attribute: string, out: string[]): void {
  walk(node, (key, value) => {
    if (key !== element) {
      return false;
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (typeof entry === 'object' && entry !== null) {
        const found = (entry as Record<string, unknown>)[attribute];
        if (typeof found === 'string') {
          out.push(found);
        }
      }
    }
    return true;
  });
}

/** Collects the text content of every `element` at any depth. */
function collectValues(node: unknown, element: string, out: string[]): void {
  walk(node, (key, value) => {
    if (key !== element) {
      return false;
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (typeof entry === 'string' || typeof entry === 'boolean' || typeof entry === 'number') {
        out.push(String(entry));
      }
    }
    return true;
  });
}

/** Depth-first walk; `visit` returns true when it consumed the node and recursion stops. */
function walk(node: unknown, visit: (key: string, value: unknown) => boolean): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visit);
    }
    return;
  }
  if (typeof node !== 'object' || node === null) {
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!visit(key, value)) {
      walk(value, visit);
    }
  }
}
