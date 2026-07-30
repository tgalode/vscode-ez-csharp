import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activateExtension } from './harness';
import { cancel, driveUi, type Ui } from './ui';

const CONTRIBUTED_COMMANDS = [
  'solutionScope.switchScope',
  'solutionScope.generateFilter',
  'solutionScope.clearScope',
  'solutionScope.refresh',
  'solutionScope.showLog',
];

describe('activation', () => {
  before(async () => {
    await activateExtension();
  });

  it('registers every contributed command', async () => {
    const registered = await vscode.commands.getCommands(true);
    for (const command of CONTRIBUTED_COMMANDS) {
      assert.ok(registered.includes(command), `${command} is not registered`);
    }
  });

  it('offers the solution and both filters, grouped, with a way out', async () => {
    let ui: Ui | undefined;
    try {
      ui = driveUi({ quickPicks: [cancel()] });
      await vscode.commands.executeCommand('solutionScope.switchScope');

      assert.equal(ui.quickPicks.length, 1);
      assert.deepEqual(ui.quickPicks[0]?.labels, [
        '$(circle-slash) No scope',
        'Solutions',
        'Contoso.sln',
        'Contoso.slnx',
        'Filters',
        'Broken.slnf',
        'Contoso.Core.slnf',
      ]);
      assert.deepEqual(ui.messages, []);
    } finally {
      ui?.restore();
    }
  });
});
