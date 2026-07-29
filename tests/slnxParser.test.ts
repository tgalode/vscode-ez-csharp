import { describe, expect, it } from 'vitest';
import { parseSlnx } from '../src/model/slnxParser';

describe('parseSlnx', () => {
  it('reads root projects and derives their name from the file name', () => {
    const result = parseSlnx(`<Solution>
  <Project Path="src/Api/Api.csproj" />
</Solution>`);

    expect(result.diagnostics).toEqual([]);
    expect(result.projects).toEqual([{ name: 'Api', relativePath: 'src/Api/Api.csproj' }]);
  });

  it('reads a single project that the parser would otherwise not see as a list', () => {
    const result = parseSlnx(`<Solution><Project Path="A.csproj" /></Solution>`);
    expect(result.projects).toHaveLength(1);
  });

  it('strips the surrounding slashes of a folder name', () => {
    const result = parseSlnx(`<Solution>
  <Folder Name="/1 - Libs/Common/">
    <Project Path="src\\Core\\Core.csproj" />
  </Folder>
</Solution>`);

    expect(result.projects).toEqual([
      { name: 'Core', relativePath: 'src/Core/Core.csproj', folder: '1 - Libs/Common' },
    ]);
  });

  /**
   * The underlying parser accepts an unclosed element without complaining, so the
   * malformed file is reported explicitly while still yielding what can be recovered.
   */
  it('reports malformed XML and still recovers the projects it can read', () => {
    const result = parseSlnx('<Solution><Project Path="a.csproj"></Solution>');

    expect(result.diagnostics[0]).toContain('Malformed XML');
    expect(result.projects.map((project) => project.name)).toEqual(['a']);
  });

  it('reports a project without a Path attribute and keeps the others', () => {
    const result = parseSlnx(`<Solution>
  <Project />
  <Project Path="b.csproj" />
</Solution>`);

    expect(result.projects.map((project) => project.name)).toEqual(['b']);
    expect(result.diagnostics).toHaveLength(1);
  });

  it('reports a document without a Solution root', () => {
    const result = parseSlnx('<Other />');
    expect(result.diagnostics).toEqual(['No <Solution> root element.']);
  });
});
