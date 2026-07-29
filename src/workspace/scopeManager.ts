import * as path from 'node:path';
import * as vscode from 'vscode';
import { toPosix } from '../model/paths';

const CSHARP_EXTENSION_ID = 'ms-dotnettools.csharp';
const SETTING_SECTION = 'dotnet';
const SETTING_KEY = 'defaultSolution';
const RESTART_COMMAND = 'dotnet.restartServer';

/**
 * Owns the one setting that actually narrows what the C# language server loads,
 * `dotnet.defaultSolution`.
 *
 * The value shape is dictated by how the C# extension reads it: in a multi-root
 * workspace a value stored at workspace level is only honored when absolute, while a
 * single-root workspace resolves relative paths against its folder. Writing the wrong
 * shape fails silently, so the distinction is respected here rather than guessed.
 */
export class ScopeManager {
  /** Absolute path of the pinned solution or filter, or undefined when nothing is pinned. */
  current(): string | undefined {
    const raw = vscode.workspace.getConfiguration(SETTING_SECTION).get<string>(SETTING_KEY, '');
    if (raw === '' || raw === 'disable') {
      return undefined;
    }
    if (path.isAbsolute(raw)) {
      return raw;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder === undefined ? undefined : path.resolve(folder.uri.fsPath, toPosix(raw));
  }

  async pin(target: vscode.Uri): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const owning = vscode.workspace.getWorkspaceFolder(target);

    if (folders.length > 1 || owning === undefined) {
      await this.write(target.fsPath, vscode.ConfigurationTarget.Workspace);
      return;
    }

    const relative = toPosix(path.relative(owning.uri.fsPath, target.fsPath));
    await this.write(relative, vscode.ConfigurationTarget.Workspace);
  }

  async clear(): Promise<void> {
    await this.write(undefined, vscode.ConfigurationTarget.Workspace);
  }

  /** True when the C# extension is installed, which is what makes pinning take effect. */
  isCSharpExtensionPresent(): boolean {
    return vscode.extensions.getExtension(CSHARP_EXTENSION_ID) !== undefined;
  }

  /**
   * Restarting is what makes a switch visible. Failure is reported to the caller
   * rather than swallowed, because a silent no-op looks like the switch did nothing.
   */
  async restartLanguageServer(): Promise<boolean> {
    const enabled = vscode.workspace
      .getConfiguration('solutionScope')
      .get<boolean>('restartLanguageServerOnSwitch', true);

    if (!enabled || !this.isCSharpExtensionPresent()) {
      return false;
    }

    try {
      await vscode.commands.executeCommand(RESTART_COMMAND);
      return true;
    } catch {
      return false;
    }
  }

  private async write(value: string | undefined, target: vscode.ConfigurationTarget): Promise<void> {
    await vscode.workspace.getConfiguration(SETTING_SECTION).update(SETTING_KEY, value, target);
  }
}
