import * as vscode from 'vscode';
import type { FileReader } from '../model/types';
import type { ExistenceProbe } from '../filters/validation';

/**
 * Reads through `vscode.workspace.fs` rather than `node:fs` so the extension keeps
 * working on virtual file systems such as remote or GitHub workspaces.
 */
export class WorkspaceFileSystem implements FileReader, ExistenceProbe {
  private readonly decoder = new TextDecoder();

  async readFile(absolutePath: string): Promise<string | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
      return this.decoder.decode(bytes);
    } catch {
      return undefined;
    }
  }

  async exists(absolutePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(absolutePath),
      new TextEncoder().encode(content),
    );
  }
}
