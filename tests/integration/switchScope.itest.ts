import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activateExtension, scopeSetting } from './harness';
import { cancel, driveUi, pick, type Ui } from './ui';

/*
 * This suite runs without the C# extension, which is the situation the design promised
 * to degrade gracefully in: `dotnet.defaultSolution` is not a registered setting then,
 * and VS Code refuses to write it. What the user must never see is a raw
 * "not a registered configuration" error from the settings layer.
 */
describe('switch scope, without the C# extension installed', () => {
  let ui: Ui | undefined;

  before(async () => {
    await activateExtension();
  });

  afterEach(() => {
    ui?.restore();
    ui = undefined;
  });

  it('says the C# extension is missing rather than leaking a settings error', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln')] });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    assert.deepEqual(ui.messagesOfKind('error'), [], 'no raw error should reach the user');
    const warnings = ui.messagesOfKind('warning');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.message, /ms-dotnettools\.csharp/);
    assert.equal(scopeSetting(), undefined, 'nothing can be pinned, so nothing is written');
  });

  it('reports the same on Clear Scope instead of failing', async () => {
    ui = driveUi({});

    await vscode.commands.executeCommand('solutionScope.clearScope');

    assert.deepEqual(ui.messagesOfKind('error'), []);
    assert.equal(ui.messagesOfKind('warning').length, 1);
  });

  it('does nothing at all when the pick is dismissed', async () => {
    ui = driveUi({ quickPicks: [cancel()] });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    assert.deepEqual(ui.messages, []);
    assert.equal(scopeSetting(), undefined);
  });

  it('refuses a filter naming a project the solution does not contain', async () => {
    ui = driveUi({
      quickPicks: [pick('Broken.slnf')],
      answerMessage: () => 'Show log',
    });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    const warnings = ui.messagesOfKind('warning');
    assert.equal(warnings.length, 1, 'the unusable filter is reported before anything is pinned');
    assert.match(warnings[0]!.message, /Broken\.slnf/);
    assert.match(warnings[0]!.message, /1 unusable project reference/);
    assert.deepEqual(warnings[0]!.actions, ['Pin anyway', 'Show log']);
  });

  it('lets the user force an unusable filter through, and still warns about the rest', async () => {
    ui = driveUi({
      quickPicks: [pick('Broken.slnf')],
      answerMessage: (message) => (message.actions.includes('Pin anyway') ? 'Pin anyway' : undefined),
    });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    assert.deepEqual(ui.messagesOfKind('error'), []);
    const warnings = ui.messagesOfKind('warning');
    assert.equal(warnings.length, 2, 'the unusable filter, then the missing C# extension');
    assert.match(warnings[1]!.message, /ms-dotnettools\.csharp/);
  });

  it('accepts a filter that matches its solution', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.Core.slnf')] });

    await vscode.commands.executeCommand('solutionScope.switchScope');

    assert.deepEqual(ui.messagesOfKind('error'), []);
    const warnings = ui.messagesOfKind('warning');
    assert.equal(warnings.length, 1, 'only the missing C# extension is worth saying');
    assert.match(warnings[0]!.message, /ms-dotnettools\.csharp/);
  });
});
