import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../services';
import type { ProjectEntry, SolutionModel } from '../model/types';
import { ProjectGraph } from '../model/projectGraph';
import { planFilter } from '../filters/planner';
import { resolveFromDir } from '../model/paths';
import { pickSolution, saveFilter } from './filterFlow';
import { applyScope } from './applyScope';

interface ProjectItem extends vscode.QuickPickItem {
  entry: ProjectEntry;
}

export async function generateFilter(services: Services): Promise<void> {
  const solution = await pickSolution(services);
  if (solution === undefined) {
    return;
  }

  const selected = await pickProjects(solution);
  if (selected === undefined || selected.length === 0) {
    return;
  }

  const plan = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ezsharp: resolving references' },
    async () => {
      const settings = vscode.workspace.getConfiguration('ezsharp');
      const graph = new ProjectGraph(services.files, {
        configuration: settings.get<string>('configuration', 'Debug'),
      });
      const solutionDirectory = path.dirname(solution.solutionPath);
      const roots = selected.map((entry) => resolveFromDir(solutionDirectory, entry.relativePath));
      const result = await planFilter(solution, roots, graph, {
        includeTestProjects: settings.get<boolean>('includeTestProjects', true),
      });
      services.log.diagnostics('Project graph', graph.diagnostics);
      return result;
    },
  );

  services.log.diagnostics('Filter plan', plan.diagnostics);

  const targetUri = await saveFilter(services, {
    solutionAbsolutePath: solution.solutionPath,
    projectAbsolutePaths: plan.projects,
    suggestedName: `${selected[0]?.name ?? 'scope'}.slnf`,
  });
  if (targetUri === undefined) {
    return;
  }

  const summary =
    `${path.basename(targetUri.fsPath)}: ${plan.projects.length} project(s)` +
    (plan.addedTestProjects.length > 0 ? `, including ${plan.addedTestProjects.length} test project(s)` : '') +
    (plan.excludedOutsideSolution.length > 0
      ? `, ${plan.excludedOutsideSolution.length} left out as absent from the solution`
      : '');

  const choice = await vscode.window.showInformationMessage(summary, 'Apply now', 'Open file');

  if (choice === 'Apply now') {
    await applyScope(services, targetUri);
  } else if (choice === 'Open file') {
    await vscode.window.showTextDocument(targetUri);
  }
}

async function pickProjects(solution: SolutionModel): Promise<ProjectEntry[] | undefined> {
  const items: ProjectItem[] = [...solution.projects]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => ({
      label: entry.name,
      detail: entry.relativePath,
      entry,
      ...(entry.folder === undefined ? {} : { description: entry.folder }),
    }));

  const picked = await vscode.window.showQuickPick(items, {
    title: `ezsharp: ${path.basename(solution.filePath)}`,
    placeHolder: 'Pick the projects you want to work on. Their dependencies are added automatically.',
    canPickMany: true,
    matchOnDetail: true,
  });

  return picked?.map((item) => item.entry);
}
