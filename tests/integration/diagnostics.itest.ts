import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activateExtension, deleteIfPresent, inWorkspace, readTextFile } from './harness';

/*
 * Written at run time, removed after each test so discovery stays stable.
 *
 * Every test uses its own file name on purpose. A TextDocument outlives the editor that
 * showed it, and openTextDocument on an already-open path returns the cached document
 * without re-reading the disk and without firing an open event, so reusing one name
 * silently validates the previous test's text.
 */
const GENERATED = [
  'DiagEdit.slnf',
  'DiagDisk.slnf',
  'DiagDisk.sln',
  'DiagMalformed.slnf',
  'DiagNoSolution.slnf',
];

const VALID_FILTER = `{
  "solution": {
    "path": "Contoso.sln",
    "projects": [
      "src\\\\Contoso.Core\\\\Contoso.Core.csproj"
    ]
  }
}
`;

describe('filter diagnostics', () => {
  before(async () => {
    await activateExtension();
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    for (const name of GENERATED) {
      await deleteIfPresent(inWorkspace(name));
    }
    await vscode.commands.executeCommand('solutionScope.refresh');
  });

  it('underlines the entry a filter names outside its solution', async () => {
    const uri = vscode.Uri.file(inWorkspace('Broken.slnf'));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const [diagnostic] = await waitFor(uri, (all) => all.length === 1, 'one diagnostic');

    assert.equal(diagnostic!.severity, vscode.DiagnosticSeverity.Error);
    assert.equal(diagnostic!.source, 'Solution Scope');
    assert.equal(diagnostic!.code, 'missingFromSolution');
    assert.match(diagnostic!.message, /MSB5028/);
    assert.equal(
      document.getText(diagnostic!.range),
      '"src\\\\Contoso.Ghost\\\\Contoso.Ghost.csproj"',
      'the range must cover the offending entry, not the whole file',
    );
  });

  it('lints the text being edited, not the file on disk', async () => {
    await write('DiagEdit.slnf', VALID_FILTER);
    const uri = vscode.Uri.file(inWorkspace('DiagEdit.slnf'));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    await waitFor(uri, (all) => all.length === 0, 'a clean filter');

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, findRange(document, 'Contoso.Core'), 'Contoso.Ghost');
    assert.ok(await vscode.workspace.applyEdit(edit));

    const [diagnostic] = await waitFor(uri, (all) => all.length === 1, 'a diagnostic on unsaved text');
    assert.equal(diagnostic!.code, 'missingFromSolution');

    assert.match(
      await readTextFile(inWorkspace('DiagEdit.slnf')),
      /Contoso\.Core/,
      'the file on disk must be untouched, which proves the editor text was linted',
    );

    await vscode.commands.executeCommand('workbench.action.files.revert');
    await waitFor(uri, (all) => all.length === 0, 'the diagnostic to clear after a revert');
  });

  it('warns rather than errors when a listed project is missing from disk', async () => {
    await write(
      'DiagDisk.sln',
      [
        'Microsoft Visual Studio Solution File, Format Version 12.00',
        'Project("{9A19103F-16F7-32DF-9DBA-1F1AD9E0DE0C}") = "Contoso.Absent", "src\\Contoso.Absent\\Contoso.Absent.csproj", "{88888888-8888-8888-8888-888888888888}"',
        'EndProject',
      ].join('\n'),
    );
    await write(
      'DiagDisk.slnf',
      '{"solution":{"path":"DiagDisk.sln","projects":["src\\\\Contoso.Absent\\\\Contoso.Absent.csproj"]}}',
    );

    const uri = vscode.Uri.file(inWorkspace('DiagDisk.slnf'));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));

    const [diagnostic] = await waitFor(uri, (all) => all.length === 1, 'one diagnostic');

    assert.equal(diagnostic!.severity, vscode.DiagnosticSeverity.Warning);
    assert.equal(diagnostic!.code, 'missingOnDisk');
  });

  it('reports a malformed filter once, at the top of the file', async () => {
    await write('DiagMalformed.slnf', '{ "solution": { "path": ');

    const uri = vscode.Uri.file(inWorkspace('DiagMalformed.slnf'));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const [diagnostic] = await waitFor(uri, (all) => all.length === 1, 'one diagnostic');

    assert.equal(diagnostic!.severity, vscode.DiagnosticSeverity.Error);
    assert.equal(diagnostic!.code, 'unresolved');
    assert.equal(diagnostic!.range.start.line, 0);
  });

  it('underlines the declared solution path when that solution cannot be read', async () => {
    await write('DiagNoSolution.slnf', '{"solution":{"path":"Nope.sln","projects":[]}}');

    const uri = vscode.Uri.file(inWorkspace('DiagNoSolution.slnf'));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const [diagnostic] = await waitFor(uri, (all) => all.length === 1, 'one diagnostic');

    assert.equal(diagnostic!.severity, vscode.DiagnosticSeverity.Error);
    assert.equal(diagnostic!.code, 'solutionUnreadable');
    assert.equal(
      document.getText(diagnostic!.range),
      '"Nope.sln"',
      'the range must cover the declared path, which is the line to fix',
    );
  });

  /*
   * Clearing on close is wired to onDidCloseTextDocument, and deliberately not asserted
   * here: VS Code keeps a TextDocument alive after its editor closes and fires that event
   * on its own schedule, so any assertion would be a bet on timing. What a test can pin
   * down is that a filter which stops having problems stops having diagnostics, which the
   * revert above covers.
   */
});

async function write(name: string, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(inWorkspace(name)),
    new TextEncoder().encode(content),
  );
}

function findRange(document: vscode.TextDocument, text: string): vscode.Range {
  const offset = document.getText().indexOf(text);
  assert.notEqual(offset, -1, `"${text}" is not in the document`);
  return new vscode.Range(document.positionAt(offset), document.positionAt(offset + text.length));
}

/**
 * Diagnostics are produced asynchronously and behind a debounce, so a test waits for the
 * state it expects rather than assuming it has already arrived.
 */
async function waitFor(
  uri: vscode.Uri,
  predicate: (diagnostics: readonly vscode.Diagnostic[]) => boolean,
  description: string,
): Promise<readonly vscode.Diagnostic[]> {
  const deadline = 8000;
  const step = 50;

  for (let waited = 0; waited <= deadline; waited += step) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (predicate(diagnostics)) {
      return diagnostics;
    }
    await new Promise((resolve) => setTimeout(resolve, step));
  }

  const actual = vscode.languages
    .getDiagnostics(uri)
    .map((diagnostic) => `${String(diagnostic.code)}: ${diagnostic.message}`);
  assert.fail(`Timed out waiting for ${description}. Current diagnostics: ${actual.join(' | ')}`);
}
