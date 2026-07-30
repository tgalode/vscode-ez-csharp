import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activateExtension, resetScope, scopeSetting } from '../integration/harness';
import { cancel, driveUi, pick, type Ui } from '../integration/ui';

/*
 * These tests need ms-dotnettools.csharp installed, so they run under the `csharp`
 * label. It is what registers dotnet.defaultSolution, and therefore the only way to
 * observe the value the extension actually writes.
 *
 * Restarting the language server is switched off here: the restart command's existence
 * is asserted, but starting Roslyn on a fixture whose projects were never restored is
 * slow and tells us nothing.
 */
describe('pinning a scope, with the C# extension installed', () => {
  let ui: Ui | undefined;

  before(async () => {
    await vscode.workspace
      .getConfiguration('ezsharp')
      .update('restartLanguageServerOnSwitch', false, vscode.ConfigurationTarget.Workspace);
    await activateExtension();
  });

  after(async () => {
    await vscode.workspace
      .getConfiguration('ezsharp')
      .update('restartLanguageServerOnSwitch', undefined, vscode.ConfigurationTarget.Workspace);
  });

  afterEach(async () => {
    ui?.restore();
    ui = undefined;
    await resetScope();
  });

  /*
   * Asserted against the manifest, not against getCommands(): the C# extension only
   * registers its commands once it has fully started a language server, which it does
   * not do in a bare test host. What matters here is that the id switching a scope
   * calls is still the id that extension ships.
   */
  it('calls a restart command the C# extension still declares', () => {
    const csharp = vscode.extensions.getExtension('ms-dotnettools.csharp');
    assert.ok(csharp !== undefined, 'ms-dotnettools.csharp is not installed in this host');

    const manifest = csharp.packageJSON as {
      contributes?: { commands?: { command?: string }[] };
    };
    const declared = (manifest.contributes?.commands ?? [])
      .map((entry) => entry.command)
      .filter((command): command is string => typeof command === 'string')
      .sort();

    assert.ok(
      declared.includes('dotnet.restartServer'),
      `dotnet.restartServer is gone; the C# extension declares: ${declared.join(', ')}`,
    );
  });

  it('writes a solution as a path relative to the single workspace folder', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln')] });

    await vscode.commands.executeCommand('ezsharp.switchScope');

    assert.deepEqual(ui.messages, [], 'a scope that applies says nothing');
    assert.equal(scopeSetting(), 'Contoso.sln');
  });

  it('writes a filter the same way', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.Core.slnf')] });

    await vscode.commands.executeCommand('ezsharp.switchScope');

    assert.deepEqual(ui.messages, []);
    assert.equal(scopeSetting(), 'Contoso.Core.slnf');
  });

  it('marks the pinned scope in the picker, which proves the value round-trips', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln'), cancel()] });

    await vscode.commands.executeCommand('ezsharp.switchScope');
    await vscode.commands.executeCommand('ezsharp.switchScope');

    assert.deepEqual(ui.quickPicks[1]?.labels, [
      '$(circle-slash) No scope',
      'Solutions',
      '$(check) Contoso.sln',
      'Contoso.slnx',
      'Filters',
      'Broken.slnf',
      'Contoso.Core.slnf',
    ]);
  });

  it('clears the setting rather than leaving an empty value behind', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln'), pick('No scope')] });

    await vscode.commands.executeCommand('ezsharp.switchScope');
    assert.equal(scopeSetting(), 'Contoso.sln');

    await vscode.commands.executeCommand('ezsharp.switchScope');
    assert.equal(scopeSetting(), undefined);
  });

  it('clears the setting through Clear Scope too', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln')] });

    await vscode.commands.executeCommand('ezsharp.switchScope');
    assert.equal(scopeSetting(), 'Contoso.sln');

    await vscode.commands.executeCommand('ezsharp.clearScope');
    assert.equal(scopeSetting(), undefined);
    assert.deepEqual(ui.messages, []);
  });
});
