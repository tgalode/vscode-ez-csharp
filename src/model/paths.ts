import * as path from 'node:path';

/** Solution files may use either separator. Everything inside the model uses forward slashes. */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Solution filters written by Visual Studio and Rider use backslashes. The .NET SDK
 * accepts both on every OS, but we emit backslashes so our filters stay
 * byte-comparable with the ones those tools produce.
 */
export function toWindows(p: string): string {
  return p.replace(/\//g, '\\');
}

/** Resolves a solution-relative path to an absolute OS path. */
export function resolveFromDir(dirAbsolute: string, relative: string): string {
  return path.resolve(dirAbsolute, toPosix(relative));
}

/** Expresses an absolute OS path relative to a directory, with forward slashes. */
export function relativeFromDir(dirAbsolute: string, absolute: string): string {
  return toPosix(path.relative(dirAbsolute, absolute));
}

/** `src/A/A.csproj` -> `A` */
export function projectNameFromPath(relativePath: string): string {
  const base = toPosix(relativePath).split('/').pop() ?? relativePath;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Comparison key for an absolute path.
 *
 * A solution and a project file routinely disagree on the casing of a shared directory
 * while still naming the same file on macOS and Windows. Treating them as distinct would
 * silently drop a dependency.
 */
export function pathKey(absolutePath: string): string {
  return absolutePath.toLowerCase();
}

/** Stable order over absolute paths, case-insensitive. */
export function comparePaths(left: string, right: string): number {
  const a = pathKey(left);
  const b = pathKey(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
