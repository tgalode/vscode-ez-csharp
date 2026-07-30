import * as path from 'node:path';
import * as vscode from 'vscode';

export const EXTENSION_ID = 'tgalode.solution-scope';

/** Activates the extension under development and waits for its first discovery pass. */
export async function activateExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (extension === undefined) {
    throw new Error(`${EXTENSION_ID} is not loaded in this extension host.`);
  }
  await extension.activate();
  // activate() kicks discovery off without awaiting it; the commands need its result.
  await vscode.commands.executeCommand('solutionScope.refresh');
}

export function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    throw new Error('The test host opened no workspace folder.');
  }
  return folder.uri.fsPath;
}

export function inWorkspace(...segments: string[]): string {
  return path.join(workspaceRoot(), ...segments);
}

/** The raw workspace-level value of `dotnet.defaultSolution`, as written on disk. */
export function scopeSetting(): string | undefined {
  return vscode.workspace.getConfiguration('dotnet').inspect<string>('defaultSolution')
    ?.workspaceValue;
}

export async function resetScope(): Promise<void> {
  await vscode.workspace
    .getConfiguration('dotnet')
    .update('defaultSolution', undefined, vscode.ConfigurationTarget.Workspace);
}

export async function deleteIfPresent(absolutePath: string): Promise<void> {
  try {
    await vscode.workspace.fs.delete(vscode.Uri.file(absolutePath));
  } catch {
    // Not there, which is the desired state.
  }
}

export async function readTextFile(absolutePath: string): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
  return new TextDecoder().decode(bytes);
}

export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
    return true;
  } catch {
    return false;
  }
}
