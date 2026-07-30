import * as path from 'node:path';
import * as vscode from 'vscode';
import { Discovery } from './workspace/discovery';
import { Log } from './workspace/log';
import { ScopeManager } from './workspace/scopeManager';
import { ScopeStatusBar } from './workspace/statusBar';
import { WorkspaceFileSystem } from './workspace/fileSystem';
import type { Services } from './services';
import { switchScope } from './commands/switchScope';
import { generateFilter } from './commands/generateFilter';
import { applyScope } from './commands/applyScope';
import { FilterDiagnostics } from './workspace/filterDiagnostics';

export function activate(context: vscode.ExtensionContext): void {
  const log = new Log();
  const discovery = new Discovery();
  const scope = new ScopeManager();
  const statusBar = new ScopeStatusBar();
  const files = new WorkspaceFileSystem();
  const filterDiagnostics = new FilterDiagnostics(files);

  const services: Services = {
    discovery,
    scope,
    statusBar,
    files,
    log,
    refreshStatusBar: () => {
      const current = scope.current();
      statusBar.render(current === undefined ? undefined : path.basename(current));
    },
  };

  context.subscriptions.push(
    log,
    discovery,
    statusBar,
    filterDiagnostics,
    vscode.commands.registerCommand('ezsharp.switchScope', () => run(log, () => switchScope(services))),
    vscode.commands.registerCommand('ezsharp.generateFilter', () =>
      run(log, () => generateFilter(services)),
    ),
    vscode.commands.registerCommand('ezsharp.clearScope', () =>
      run(log, () => applyScope(services, undefined)),
    ),
    vscode.commands.registerCommand('ezsharp.refresh', () =>
      run(log, () => discovery.refresh()),
    ),
    vscode.commands.registerCommand('ezsharp.showLog', () => log.show()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('dotnet.defaultSolution') ||
        event.affectsConfiguration('ezsharp.statusBar.enabled')
      ) {
        services.refreshStatusBar();
      }
    }),
  );

  services.refreshStatusBar();
  void discovery.refresh();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}

/**
 * A command that throws would surface as an unhandled rejection with no context, so
 * failures are logged and shown once, in terms the user can act on.
 */
async function run(log: Log, action: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.info(`Command failed: ${message}`);
    void vscode.window.showErrorMessage(`ezsharp: ${message}`);
  }
}
