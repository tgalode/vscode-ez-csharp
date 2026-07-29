export type SolutionFormat = 'sln' | 'slnx' | 'slnf';

export interface ProjectEntry {
  /** Display name, as written in the solution or derived from the file name. */
  name: string;
  /** Path relative to the solution directory, always with forward slashes. */
  relativePath: string;
  /** Solution folder path with forward slashes, e.g. `3 - Web/Legacy`. Absent at the root. */
  folder?: string;
}

/**
 * A solution, filter, or slnx after parsing. Paths are normalized so the rest of
 * the extension never has to care which format or OS produced the file.
 */
export interface SolutionModel {
  format: SolutionFormat;
  /** Absolute path of the parsed file. */
  filePath: string;
  /**
   * Absolute path of the solution that defines the project set. Equals `filePath`
   * for `.sln` and `.slnx`; points at the filtered solution for `.slnf`.
   */
  solutionPath: string;
  projects: ProjectEntry[];
  /** Non-fatal problems found while parsing. Never thrown, always surfaced in the log. */
  diagnostics: string[];
}

/** What a format parser returns before paths are resolved against the file system. */
export interface ParsedSolution {
  projects: ProjectEntry[];
  diagnostics: string[];
  /** Set by the `.slnf` parser only: the solution path it declares, relative to itself. */
  solutionRelativePath?: string;
}

export interface FileReader {
  /** Returns the file content, or undefined when it cannot be read. */
  readFile(absolutePath: string): Promise<string | undefined>;
}
