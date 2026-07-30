import * as vscode from 'vscode';

/**
 * Parse problems are reported here rather than through notifications: a malformed
 * project file produces many of them, and a wall of toasts is worse than none.
 */
export class Log implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('ezsharp');
  }

  info(message: string): void {
    this.channel.appendLine(message);
  }

  diagnostics(source: string, entries: readonly string[]): void {
    if (entries.length === 0) {
      return;
    }
    this.channel.appendLine(`${source}:`);
    for (const entry of entries) {
      this.channel.appendLine(`  ${entry}`);
    }
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
