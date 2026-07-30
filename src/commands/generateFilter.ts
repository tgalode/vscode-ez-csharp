import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../services';
import type { ProjectEntry, SolutionModel } from '../model/types';
import { readSolution } from '../model/solutionReader';
import { ProjectGraph } from '../model/projectGraph';
import { planFilter } from '../filters/planner';
import { buildFilterContent } from '../filters/generator';
import { resolveFromDir } from '../model/paths';
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
    { location: vscode.ProgressLocation.Notification, title: 'Solution Scope: resolving references' },
    async () => {
      const settings = vscode.workspace.getConfiguration('solutionScope');
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

  const targetUri = await askForTarget(solution, selected);
  if (targetUri === undefined) {
    return;
  }

  if (await services.files.exists(targetUri.fsPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `${path.basename(targetUri.fsPath)} already exists. Overwrite it?`,
      { modal: true },
      'Overwrite',
    );
    if (overwrite !== 'Overwrite') {
      return;
    }
  }

  const content = buildFilterContent({
    filterAbsolutePath: targetUri.fsPath,
    solutionAbsolutePath: solution.solutionPath,
    projectAbsolutePaths: plan.projects,
  });

  await services.files.writeFile(targetUri.fsPath, content);
  await services.discovery.refresh();

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

async function pickSolution(services: Services): Promise<SolutionModel | undefined> {
  const { discovery, files, log } = services;

  if (discovery.solutions.length === 0) {
    await discovery.refresh();
  }

  const candidates = discovery.solutions;
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      'Solution Scope: no .sln or .slnx file found to build a filter from.',
    );
    return undefined;
  }

  let chosen = candidates[0]!;
  if (candidates.length > 1) {
    const picked = await vscode.window.showQuickPick(
      candidates.map((file) => ({ label: file.label, description: file.format, file })),
      { title: 'Solution Scope', placeHolder: 'Which solution should the filter apply to?' },
    );
    if (picked === undefined) {
      return undefined;
    }
    chosen = picked.file;
  }

  const model = await readSolution(chosen.uri.fsPath, files);
  if (model === undefined || model.projects.length === 0) {
    void vscode.window.showErrorMessage(
      `Solution Scope: no project found in ${chosen.label}. See the log for details.`,
    );
    if (model !== undefined) {
      log.diagnostics(model.filePath, model.diagnostics);
    }
    return undefined;
  }

  log.diagnostics(model.filePath, model.diagnostics);
  return model;
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
    title: `Solution Scope: ${path.basename(solution.filePath)}`,
    placeHolder: 'Pick the projects you want to work on. Their dependencies are added automatically.',
    canPickMany: true,
    matchOnDetail: true,
  });

  return picked?.map((item) => item.entry);
}

/** Filters live next to their solution, which is where every other tool looks for them. */
async function askForTarget(
  solution: SolutionModel,
  selected: readonly ProjectEntry[],
): Promise<vscode.Uri | undefined> {
  const suggestion = `${selected[0]?.name ?? 'scope'}.slnf`;

  const name = await vscode.window.showInputBox({
    title: 'Solution Scope',
    prompt: `Filter file name, saved next to ${path.basename(solution.solutionPath)}`,
    value: suggestion,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === '') {
        return 'A file name is required.';
      }
      if (!trimmed.toLowerCase().endsWith('.slnf')) {
        return 'The name must end with .slnf';
      }
      if (/[\\/]/.test(trimmed)) {
        return 'Use a file name without a directory.';
      }
      return undefined;
    },
  });

  if (name === undefined) {
    return undefined;
  }

  return vscode.Uri.file(path.join(path.dirname(solution.solutionPath), name.trim()));
}
