import * as vscode from 'vscode';
import type { Services } from '../services';
import type { ScopeFailure } from '../workspace/scopeManager';

/**
 * Applies a scope, or clears it when `target` is undefined, then repaints the status bar
 * and restarts the language server.
 *
 * Every path that changes the scope goes through here, so a failure is always reported
 * the same way: in terms of what the user can do about it, never as a settings-layer
 * error they did not cause.
 */
export async function applyScope(
  services: Services,
  target: vscode.Uri | undefined,
): Promise<boolean> {
  const { scope, log } = services;

  const outcome = target === undefined ? await scope.clear() : await scope.pin(target);
  services.refreshStatusBar();

  if (!outcome.applied) {
    report(services, outcome);
    return false;
  }

  const restarted = await scope.restartLanguageServer();
  if (!restarted) {
    log.info('Scope applied without restarting the language server; reload the window to apply it.');
  }
  return true;
}

function report(services: Services, failure: ScopeFailure): void {
  if (failure.reason === 'csharpExtensionMissing') {
    services.log.info('Scope not applied: ms-dotnettools.csharp is not installed.');
    void vscode.window.showWarningMessage(
      'Solution Scope: the C# extension (ms-dotnettools.csharp) is not installed, so there is no ' +
        'language server to scope. Install it, then pick a scope again.',
    );
    return;
  }

  services.log.info(`Scope not applied: ${failure.message}`);
  void vscode.window.showWarningMessage(`Solution Scope: the scope could not be saved. ${failure.message}`);
}
