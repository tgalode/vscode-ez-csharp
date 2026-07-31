import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activateExtension, deleteIfPresent, inWorkspace, readTextFile } from './harness';
import { driveUi, pick, type Ui } from './ui';

const GENERATED = ['Slice.slnf'];

interface FilterDocument {
  solution: { path: string; projects: string[] };
}

describe('slice view', () => {
  let ui: Ui | undefined;

  before(async () => {
    await activateExtension();
  });

  afterEach(async () => {
    ui?.restore();
    ui = undefined;
    await vscode.commands.executeCommand('ezsharp.slice.reset');
    for (const name of GENERATED) {
      await deleteIfPresent(inWorkspace(name));
    }
    await vscode.commands.executeCommand('ezsharp.refresh');
  });

  it('registers the view commands', async () => {
    const registered = await vscode.commands.getCommands(true);
    for (const command of [
      'ezsharp.slice.save',
      'ezsharp.slice.apply',
      'ezsharp.slice.reset',
      'ezsharp.slice.refresh',
      'ezsharp.slice.selectSolution',
      'ezsharp.slice.toggleProject',
    ]) {
      assert.ok(registered.includes(command), `${command} is not registered`);
    }
  });

  it('saves the slice a ticked project entails', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln')], inputs: ['Slice.slnf'] });

    await vscode.commands.executeCommand('ezsharp.slice.selectSolution');
    await vscode.commands.executeCommand(
      'ezsharp.slice.toggleProject',
      inWorkspace('src', 'Contoso.App', 'Contoso.App.csproj'),
    );
    await vscode.commands.executeCommand('ezsharp.slice.save');

    const document = JSON.parse(await readTextFile(inWorkspace('Slice.slnf'))) as FilterDocument;
    assert.equal(document.solution.path, 'Contoso.sln');
    assert.deepEqual(document.solution.projects, [
      'src\\Contoso.App\\Contoso.App.csproj',
      'src\\Contoso.Core\\Contoso.Core.csproj',
      'tests\\Contoso.App.Tests\\Contoso.App.Tests.csproj',
    ]);
  });

  it('suggests a name taken from the first chosen project', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln')], inputs: [undefined] });

    await vscode.commands.executeCommand('ezsharp.slice.selectSolution');
    await vscode.commands.executeCommand(
      'ezsharp.slice.toggleProject',
      inWorkspace('src', 'Contoso.App', 'Contoso.App.csproj'),
    );
    await vscode.commands.executeCommand('ezsharp.slice.save');

    assert.equal(ui.inputBoxes[0]?.value, 'Contoso.App.slnf');
  });

  it('untickings a project empties the slice again', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.sln')], inputs: ['Slice.slnf'] });
    const project = inWorkspace('src', 'Contoso.App', 'Contoso.App.csproj');

    await vscode.commands.executeCommand('ezsharp.slice.selectSolution');
    await vscode.commands.executeCommand('ezsharp.slice.toggleProject', project);
    await vscode.commands.executeCommand('ezsharp.slice.toggleProject', project);
    await vscode.commands.executeCommand('ezsharp.slice.save');

    const document = JSON.parse(await readTextFile(inWorkspace('Slice.slnf'))) as FilterDocument;
    assert.deepEqual(document.solution.projects, [], 'an empty slice writes an empty filter');
  });

  it('reports the missing C# extension when the slice is applied', async () => {
    ui = driveUi({
      quickPicks: [pick('Contoso.sln')],
      inputs: ['Slice.slnf'],
      answerMessage: () => undefined,
    });

    await vscode.commands.executeCommand('ezsharp.slice.selectSolution');
    await vscode.commands.executeCommand(
      'ezsharp.slice.toggleProject',
      inWorkspace('src', 'Contoso.App', 'Contoso.App.csproj'),
    );
    await vscode.commands.executeCommand('ezsharp.slice.apply');

    assert.deepEqual(ui.messagesOfKind('error'), []);
    assert.equal(ui.messagesOfKind('warning').length, 1);
    assert.match(ui.messagesOfKind('warning')[0]!.message, /ms-dotnettools\.csharp/);
  });
});
