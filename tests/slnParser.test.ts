import { describe, expect, it } from 'vitest';
import { parseSln } from '../src/model/slnParser';

const FOLDER = '2150E333-8FDC-42A3-9474-1A3956D46DE8';
const CSPROJ = '9A19103F-16F7-4668-BE54-9A1E7A4F7556';

function sln(body: string): string {
  return `Microsoft Visual Studio Solution File, Format Version 12.00\n${body}\n`;
}

describe('parseSln', () => {
  it('reads projects and normalizes Windows separators', () => {
    const result = parseSln(
      sln(`Project("{${CSPROJ}}") = "Api", "src\\Api\\Api.csproj", "{AAAAAAA1-0000-0000-0000-000000000001}"
EndProject`),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.projects).toEqual([{ name: 'Api', relativePath: 'src/Api/Api.csproj' }]);
  });

  it('excludes solution folders from the project list', () => {
    const result = parseSln(
      sln(`Project("{${FOLDER}}") = "1 - Libs", "1 - Libs", "{FFFFFFF1-0000-0000-0000-000000000001}"
EndProject
Project("{${CSPROJ}}") = "Core", "src/Core/Core.csproj", "{AAAAAAA1-0000-0000-0000-000000000001}"
EndProject`),
    );

    expect(result.projects.map((project) => project.name)).toEqual(['Core']);
  });

  it('resolves nested solution folders into a path', () => {
    const result = parseSln(
      sln(`Project("{${FOLDER}}") = "1 - Libs", "1 - Libs", "{FFFFFFF1-0000-0000-0000-000000000001}"
EndProject
Project("{${FOLDER}}") = "Common", "Common", "{FFFFFFF2-0000-0000-0000-000000000002}"
EndProject
Project("{${CSPROJ}}") = "Core", "src/Core/Core.csproj", "{AAAAAAA1-0000-0000-0000-000000000001}"
EndProject
Global
	GlobalSection(NestedProjects) = preSolution
		{AAAAAAA1-0000-0000-0000-000000000001} = {FFFFFFF2-0000-0000-0000-000000000002}
		{FFFFFFF2-0000-0000-0000-000000000002} = {FFFFFFF1-0000-0000-0000-000000000001}
	EndGlobalSection
EndGlobal`),
    );

    expect(result.projects[0]?.folder).toBe('1 - Libs/Common');
  });

  it('survives a cycle in NestedProjects instead of hanging', () => {
    const result = parseSln(
      sln(`Project("{${FOLDER}}") = "A", "A", "{FFFFFFF1-0000-0000-0000-000000000001}"
EndProject
Project("{${FOLDER}}") = "B", "B", "{FFFFFFF2-0000-0000-0000-000000000002}"
EndProject
Project("{${CSPROJ}}") = "Core", "src/Core/Core.csproj", "{AAAAAAA1-0000-0000-0000-000000000001}"
EndProject
Global
	GlobalSection(NestedProjects) = preSolution
		{AAAAAAA1-0000-0000-0000-000000000001} = {FFFFFFF1-0000-0000-0000-000000000001}
		{FFFFFFF1-0000-0000-0000-000000000001} = {FFFFFFF2-0000-0000-0000-000000000002}
		{FFFFFFF2-0000-0000-0000-000000000002} = {FFFFFFF1-0000-0000-0000-000000000001}
	EndGlobalSection
EndGlobal`),
    );

    expect(result.diagnostics.some((entry) => entry.includes('Cycle'))).toBe(true);
    expect(result.projects).toHaveLength(1);
  });

  it('keeps the first entry when a GUID is duplicated', () => {
    const result = parseSln(
      sln(`Project("{${CSPROJ}}") = "First", "a/First.csproj", "{AAAAAAA1-0000-0000-0000-000000000001}"
EndProject
Project("{${CSPROJ}}") = "Second", "b/Second.csproj", "{AAAAAAA1-0000-0000-0000-000000000001}"
EndProject`),
    );

    expect(result.projects.map((project) => project.name)).toEqual(['First']);
    expect(result.diagnostics.some((entry) => entry.includes('Duplicate'))).toBe(true);
  });

  it('scales to a solution with many nested entries', () => {
    const entries: string[] = [];
    const nested: string[] = [];
    for (let index = 1; index <= 60; index += 1) {
      const guid = `AAAAAAA1-0000-0000-0000-${String(index).padStart(12, '0')}`;
      entries.push(
        `Project("{${CSPROJ}}") = "P${index}", "src\\P${index}\\P${index}.csproj", "{${guid}}"\nEndProject`,
      );
      nested.push(`\t\t{${guid}} = {FFFFFFF1-0000-0000-0000-000000000001}`);
    }

    const result = parseSln(
      sln(
        `Project("{${FOLDER}}") = "Group", "Group", "{FFFFFFF1-0000-0000-0000-000000000001}"\nEndProject\n${entries.join('\n')}\nGlobal\n\tGlobalSection(NestedProjects) = preSolution\n${nested.join('\n')}\n\tEndGlobalSection\nEndGlobal`,
      ),
    );

    expect(result.projects).toHaveLength(60);
    expect(result.projects.every((project) => project.folder === 'Group')).toBe(true);
  });
});
