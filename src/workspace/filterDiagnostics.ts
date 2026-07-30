import * as path from 'node:path';
import * as vscode from 'vscode';
import type { FileReader, TextSpan } from '../model/types';
import { readSolution } from '../model/solutionReader';
import { validateFilter, type FilterProblem } from '../filters/validation';
import type { WorkspaceFileSystem } from './fileSystem';

const SOURCE = 'ezsharp';
const DEBOUNCE_MS = 300;

/**
 * Reports why an open `.slnf` will not load, in the Problems panel and on the line that
 * causes it.
 *
 * Only open documents are validated: checking a filter means parsing its parent
 * solution, which is expensive on a monolith, and a filter is acted upon when it is
 * opened. The pre-pin check in switchScope still covers a filter that was never opened.
 */
export class FilterDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('ezsharp');
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly files: WorkspaceFileSystem) {
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => void this.refresh(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.clear(document)),
    );

    for (const document of vscode.workspace.textDocuments) {
      void this.refresh(document);
    }
  }

  async refresh(document: vscode.TextDocument): Promise<void> {
    if (!isFilter(document)) {
      return;
    }

    const filter = await readSolution(
      document.uri.fsPath,
      new OpenDocumentFirst(document, this.files),
    );
    if (filter === undefined) {
      return;
    }

    /*
     * readSolution points a .slnf at itself when it could not resolve a parent solution,
     * which is exactly the set of fatal outcomes: unreadable JSON, no solution object,
     * no solution.path. Anything else leaves a filter that is partly usable, so its
     * parse problems are warnings.
     */
    const unresolved = filter.solutionPath === filter.filePath;
    const diagnostics: vscode.Diagnostic[] = filter.diagnostics.map((message) =>
      build(
        document,
        undefined,
        message,
        unresolved ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
        unresolved ? 'unresolved' : 'parse',
      ),
    );

    if (!unresolved) {
      const solution = await readSolution(filter.solutionPath, this.files);
      if (solution === undefined || solution.projects.length === 0) {
        diagnostics.push(
          build(
            document,
            filter.solutionPathSpan,
            `${filter.solutionPath} cannot be read, or lists no project.`,
            vscode.DiagnosticSeverity.Error,
            'solutionUnreadable',
          ),
        );
      } else {
        for (const problem of await validateFilter(filter, solution, this.files)) {
          diagnostics.push(describe(document, problem));
        }
      }
    }

    this.collection.set(document.uri, diagnostics);
  }

  clear(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const timer = this.pending.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pending.delete(key);
    }
    this.collection.delete(document.uri);
  }

  dispose(): void {
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.collection.dispose();
  }

  /** Debounced per document: re-parsing a large parent solution on every keystroke is waste. */
  private schedule(document: vscode.TextDocument): void {
    if (!isFilter(document)) {
      return;
    }

    const key = document.uri.toString();
    const existing = this.pending.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        void this.refresh(document);
      }, DEBOUNCE_MS),
    );
  }
}

/**
 * Reads the filter from the editor and everything else from disk, so a filter carrying
 * unsaved edits is validated as it currently reads. This keeps readSolution as the one
 * seam rather than adding a content-based entry point beside it.
 */
class OpenDocumentFirst implements FileReader {
  constructor(
    private readonly document: vscode.TextDocument,
    private readonly fallback: FileReader,
  ) {}

  async readFile(absolutePath: string): Promise<string | undefined> {
    return absolutePath.toLowerCase() === this.document.uri.fsPath.toLowerCase()
      ? this.document.getText()
      : this.fallback.readFile(absolutePath);
  }
}

function describe(document: vscode.TextDocument, problem: FilterProblem): vscode.Diagnostic {
  return problem.kind === 'missingFromSolution'
    ? build(
        document,
        problem.span,
        `${problem.absolutePath} is not in the parent solution. MSBuild rejects the filter with MSB5028 rather than skipping it.`,
        vscode.DiagnosticSeverity.Error,
        'missingFromSolution',
      )
    : build(
        document,
        problem.span,
        `${problem.absolutePath} is in the solution but no file exists there.`,
        vscode.DiagnosticSeverity.Warning,
        'missingOnDisk',
      );
}

function build(
  document: vscode.TextDocument,
  span: TextSpan | undefined,
  message: string,
  severity: vscode.DiagnosticSeverity,
  code: string,
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(rangeOf(document, span), message, severity);
  diagnostic.source = SOURCE;
  diagnostic.code = code;
  return diagnostic;
}

/** A problem with no position belongs to the file, so it lands on its first line. */
function rangeOf(document: vscode.TextDocument, span: TextSpan | undefined): vscode.Range {
  if (span === undefined) {
    return document.lineAt(0).range;
  }
  return new vscode.Range(
    document.positionAt(span.offset),
    document.positionAt(span.offset + span.length),
  );
}

function isFilter(document: vscode.TextDocument): boolean {
  return (
    document.uri.scheme === 'file' && path.extname(document.uri.fsPath).toLowerCase() === '.slnf'
  );
}
