import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../services';
import type { SolutionModel } from '../model/types';
import { readSolution } from '../model/solutionReader';
import { buildFilterContent } from '../filters/generator';

/** The solution pick and filter write flows, shared by the command and the view. */
export async function pickSolution(services: Services): Promise<SolutionModel | undefined> {
  const { discovery, files, log } = services;

  if (discovery.solutions.length === 0) {
    await discovery.refresh();
  }

  const candidates = discovery.solutions;
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      'ezsharp: no .sln or .slnx file found to build a filter from.',
    );
    return undefined;
  }

  let chosen = candidates[0]!;
  if (candidates.length > 1) {
    const picked = await vscode.window.showQuickPick(
      candidates.map((file) => ({ label: file.label, description: file.format, file })),
      { title: 'ezsharp', placeHolder: 'Which solution should the filter apply to?' },
    );
    if (picked === undefined) {
      return undefined;
    }
    chosen = picked.file;
  }

  const model = await readSolution(chosen.uri.fsPath, files);
  if (model === undefined || model.projects.length === 0) {
    void vscode.window.showErrorMessage(
      `ezsharp: no project found in ${chosen.label}. See the log for details.`,
    );
    if (model !== undefined) {
      log.diagnostics(model.filePath, model.diagnostics);
    }
    return undefined;
  }

  log.diagnostics(model.filePath, model.diagnostics);
  return model;
}

export interface SaveFilterInput {
  solutionAbsolutePath: string;
  projectAbsolutePaths: readonly string[];
  suggestedName: string;
}

export async function saveFilter(
  services: Services,
  input: SaveFilterInput,
): Promise<vscode.Uri | undefined> {
  const targetUri = await askForTarget(input.solutionAbsolutePath, input.suggestedName);
  if (targetUri === undefined) {
    return undefined;
  }

  if (await services.files.exists(targetUri.fsPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `${path.basename(targetUri.fsPath)} already exists. Overwrite it?`,
      { modal: true },
      'Overwrite',
    );
    if (overwrite !== 'Overwrite') {
      return undefined;
    }
  }

  await services.files.writeFile(
    targetUri.fsPath,
    buildFilterContent({
      filterAbsolutePath: targetUri.fsPath,
      solutionAbsolutePath: input.solutionAbsolutePath,
      projectAbsolutePaths: input.projectAbsolutePaths,
    }),
  );
  await services.discovery.refresh();

  return targetUri;
}

/** Filters live next to their solution, which is where every other tool looks for them. */
async function askForTarget(
  solutionAbsolutePath: string,
  suggestion: string,
): Promise<vscode.Uri | undefined> {
  const name = await vscode.window.showInputBox({
    title: 'ezsharp',
    prompt: `Filter file name, saved next to ${path.basename(solutionAbsolutePath)}`,
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

  return vscode.Uri.file(path.join(path.dirname(solutionAbsolutePath), name.trim()));
}
