import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../services';
import { readSolution } from '../model/solutionReader';
import { validateFilter, type FilterProblem } from '../filters/validation';
import { applyScope } from './applyScope';

interface ScopeItem extends vscode.QuickPickItem {
  uri?: vscode.Uri;
  clear?: true;
}

export async function switchScope(services: Services): Promise<void> {
  const { discovery, scope } = services;

  if (discovery.all.length === 0) {
    await discovery.refresh();
  }
  if (discovery.all.length === 0) {
    void vscode.window.showInformationMessage(
      'Solution Scope: no .sln, .slnx or .slnf file found in this workspace.',
    );
    return;
  }

  const current = scope.current()?.toLowerCase();

  const items: ScopeItem[] = [
    { label: '$(circle-slash) No scope', description: 'Let the C# extension choose', clear: true },
    { label: 'Solutions', kind: vscode.QuickPickItemKind.Separator },
    ...discovery.solutions.map((file) => toItem(file.uri, file.label, file.format, current)),
  ];

  const filters = discovery.all.filter((file) => file.format === 'slnf');
  if (filters.length > 0) {
    items.push({ label: 'Filters', kind: vscode.QuickPickItemKind.Separator });
    items.push(...filters.map((file) => toItem(file.uri, file.label, file.format, current)));
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Solution Scope',
    placeHolder: 'Pick what the C# language server should load',
    matchOnDescription: true,
  });

  if (picked === undefined) {
    return;
  }

  if (picked.clear === true) {
    await applyScope(services, undefined);
    return;
  }

  const target = picked.uri;
  if (target === undefined) {
    return;
  }

  if (path.extname(target.fsPath).toLowerCase() === '.slnf' && !(await filterIsUsable(services, target))) {
    return;
  }

  await applyScope(services, target);
}

/**
 * A filter that names a project its parent solution does not contain fails with
 * MSB5028 and the language server reports nothing useful, so the problem is surfaced
 * here, before pinning.
 */
async function filterIsUsable(services: Services, filterUri: vscode.Uri): Promise<boolean> {
  const { files, log } = services;

  const filter = await readSolution(filterUri.fsPath, files);
  if (filter === undefined) {
    return true;
  }
  log.diagnostics(filterUri.fsPath, filter.diagnostics);

  const solution = await readSolution(filter.solutionPath, files);
  if (solution === undefined) {
    void vscode.window.showErrorMessage(
      `Solution Scope: ${path.basename(filterUri.fsPath)} points at ${filter.solutionPath}, which cannot be read.`,
    );
    return false;
  }
  log.diagnostics(solution.filePath, solution.diagnostics);

  const problems = await validateFilter(filter, solution, files);
  if (problems.length === 0) {
    return true;
  }

  const of = (kind: FilterProblem['kind']): string[] =>
    problems.filter((problem) => problem.kind === kind).map((problem) => problem.absolutePath);

  log.diagnostics(`${filterUri.fsPath} (not in the solution)`, of('missingFromSolution'));
  log.diagnostics(`${filterUri.fsPath} (missing on disk)`, of('missingOnDisk'));

  const choice = await vscode.window.showWarningMessage(
    `${path.basename(filterUri.fsPath)} has ${problems.length} unusable project reference(s). MSBuild will reject it.`,
    { modal: false },
    'Pin anyway',
    'Show log',
  );

  if (choice === 'Show log') {
    log.show();
    return false;
  }
  return choice === 'Pin anyway';
}

function toItem(
  uri: vscode.Uri,
  label: string,
  format: string,
  currentLowerCase: string | undefined,
): ScopeItem {
  const active = uri.fsPath.toLowerCase() === currentLowerCase;
  return {
    label: `${active ? '$(check) ' : ''}${label}`,
    description: format,
    uri,
  };
}
