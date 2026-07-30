import * as vscode from 'vscode';
import type { SolutionFormat } from '../model/types';
import { formatOf } from '../model/solutionReader';

export interface DiscoveredFile {
  uri: vscode.Uri;
  format: SolutionFormat;
  /** Path relative to its workspace folder, for display. */
  label: string;
}

const GLOB = '**/*.{sln,slnx,slnf}';

/**
 * Keeps the list of solution and filter files in the workspace. Refreshed by a
 * watcher rather than re-globbed on every command, because a monolith sits in a large
 * tree and the switch command must feel instant.
 */
export class Discovery implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly watcher: vscode.FileSystemWatcher;
  private files: DiscoveredFile[] = [];

  readonly onDidChange = this.changed.event;

  constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher(GLOB);
    this.watcher.onDidCreate(() => void this.refresh());
    this.watcher.onDidDelete(() => void this.refresh());
  }

  async refresh(): Promise<void> {
    const exclude = vscode.workspace
      .getConfiguration('ezsharp')
      .get<string>('exclude', '**/{node_modules,bin,obj,.git}/**');

    const found = await vscode.workspace.findFiles(GLOB, exclude === '' ? null : exclude);

    this.files = found
      .flatMap((uri) => {
        const format = formatOf(uri.fsPath);
        return format === undefined ? [] : [{ uri, format, label: labelOf(uri) }];
      })
      .sort((left, right) => left.label.localeCompare(right.label));

    this.changed.fire();
  }

  get all(): readonly DiscoveredFile[] {
    return this.files;
  }

  get solutions(): readonly DiscoveredFile[] {
    return this.files.filter((file) => file.format !== 'slnf');
  }

  dispose(): void {
    this.watcher.dispose();
    this.changed.dispose();
  }
}

/**
 * Two folders of a multi-root workspace can each hold a solution of the same name, and
 * without the folder in the label the picker shows two indistinguishable entries. A
 * single-root workspace has nothing to disambiguate, so the folder is left out there.
 */
function labelOf(uri: vscode.Uri): string {
  const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
  return vscode.workspace.asRelativePath(uri, multiRoot);
}
