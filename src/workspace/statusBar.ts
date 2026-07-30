import * as vscode from 'vscode';

/**
 * Shows which slice of the repository the language server is loading. Without it the
 * active scope is invisible, and a wrong scope looks exactly like broken IntelliSense.
 */
export class ScopeStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem('ezsharp.scope', vscode.StatusBarAlignment.Left, 90);
    this.item.name = 'ezsharp';
    this.item.command = 'ezsharp.switchScope';
  }

  /** `label` is undefined when no scope is pinned. */
  render(label: string | undefined): void {
    const enabled = vscode.workspace
      .getConfiguration('ezsharp')
      .get<boolean>('statusBar.enabled', true);

    if (!enabled) {
      this.item.hide();
      return;
    }

    if (label === undefined) {
      this.item.text = '$(filter) No scope';
      this.item.tooltip = 'No solution pinned. The C# extension picks one on its own.';
    } else {
      this.item.text = `$(filter) ${label}`;
      this.item.tooltip = `C# language server scoped to ${label}`;
    }
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
