import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { activateExtension, resetScope, scopeSetting } from '../integration/harness';
import { cancel, driveUi, pick, type Ui } from '../integration/ui';

/*
 * The trap this suite exists for: in a multi-root workspace the C# extension only
 * honours dotnet.defaultSolution when the value is absolute, and a relative one is
 * ignored without a word. Nothing in a single-root run can catch a regression there.
 */
describe('pinning a scope in a multi-root workspace', () => {
  let ui: Ui | undefined;

  before(async () => {
    await vscode.workspace
      .getConfiguration('solutionScope')
      .update('restartLanguageServerOnSwitch', false, vscode.ConfigurationTarget.Workspace);
    await activateExtension();
  });

  after(async () => {
    await vscode.workspace
      .getConfiguration('solutionScope')
      .update('restartLanguageServerOnSwitch', undefined, vscode.ConfigurationTarget.Workspace);
  });

  afterEach(async () => {
    ui?.restore();
    ui = undefined;
    await resetScope();
  });

  it('opened both folders', () => {
    assert.equal(vscode.workspace.workspaceFolders?.length, 2);
  });

  it('offers the solutions of every folder, each labelled by its folder', async () => {
    ui = driveUi({ quickPicks: [cancel()] });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    assert.deepEqual(ui.quickPicks[0]?.labels, [
      '$(circle-slash) No scope',
      'Solutions',
      'secondary/Secondary.sln',
      'workspace/Contoso.sln',
      'workspace/Contoso.slnx',
      'Filters',
      'workspace/Broken.slnf',
      'workspace/Contoso.Core.slnf',
    ]);
  });

  it('writes an absolute path, the only shape a multi-root workspace honours', async () => {
    ui = driveUi({ quickPicks: [pick('workspace/Contoso.sln')] });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    const written = scopeSetting();
    assert.ok(written !== undefined, 'nothing was written');
    assert.ok(path.isAbsolute(written), `expected an absolute path, got "${written}"`);
    assert.equal(path.basename(written), 'Contoso.sln');
  });

  it('marks the pinned solution on the next pass, whichever folder it came from', async () => {
    ui = driveUi({ quickPicks: [pick('secondary/Secondary.sln'), cancel()] });

    await vscode.commands.executeCommand('solutionScope.switchScope');
    await vscode.commands.executeCommand('solutionScope.switchScope');

    assert.ok(
      ui.quickPicks[1]?.labels.includes('$(check) secondary/Secondary.sln'),
      `no check mark in: ${ui.quickPicks[1]?.labels.join(', ')}`,
    );
  });
});
