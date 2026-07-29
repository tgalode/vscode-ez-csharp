import * as path from 'node:path';
import type { FileReader } from '../src/model/types';
import type { ExistenceProbe } from '../src/filters/validation';

/** Absolute path under a fake repository root, valid on every OS. */
export function abs(...segments: string[]): string {
  return path.resolve(path.sep, 'repo', ...segments);
}

/** In-memory file system keyed by absolute path. */
export class StubFiles implements FileReader, ExistenceProbe {
  private readonly entries = new Map<string, string>();

  set(absolutePath: string, content: string): this {
    this.entries.set(absolutePath, content);
    return this;
  }

  /** Declares a project file with the given `ProjectReference` targets and packages. */
  project(
    absolutePath: string,
    options: { references?: string[]; packages?: string[]; isTestProject?: boolean } = {},
  ): this {
    const references = (options.references ?? [])
      .map((reference) => `    <ProjectReference Include="${reference}" />`)
      .join('\n');
    const packages = (options.packages ?? [])
      .map((name) => `    <PackageReference Include="${name}" />`)
      .join('\n');
    const flag = options.isTestProject === true ? '    <IsTestProject>true</IsTestProject>\n' : '';

    return this.set(
      absolutePath,
      `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n${flag}  </PropertyGroup>\n  <ItemGroup>\n${packages}\n  </ItemGroup>\n  <ItemGroup>\n${references}\n  </ItemGroup>\n</Project>\n`,
    );
  }

  async readFile(absolutePath: string): Promise<string | undefined> {
    return this.entries.get(absolutePath);
  }

  async exists(absolutePath: string): Promise<boolean> {
    return this.entries.has(absolutePath);
  }
}
