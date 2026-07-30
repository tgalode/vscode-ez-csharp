import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  activateExtension,
  deleteIfPresent,
  fileExists,
  inWorkspace,
  readTextFile,
  scopeSetting,
} from './harness';
import { cancel, driveUi, pick, pickMany, type Ui } from './ui';

/** Every name the suite may write, removed after each test so discovery stays stable. */
const GENERATED = ['Contoso.App.slnf', 'Local.slnf', 'NoTests.slnf', 'FromSlnx.slnf'];

interface FilterDocument {
  solution: { path: string; projects: string[] };
}

describe('generate filter', () => {
  let ui: Ui | undefined;

  before(async () => {
    await activateExtension();
  });

  afterEach(async () => {
    ui?.restore();
    ui = undefined;
    for (const name of GENERATED) {
      await deleteIfPresent(inWorkspace(name));
    }
    await setConfiguration(undefined);
    await setIncludeTestProjects(undefined);
    await vscode.commands.executeCommand('solutionScope.refresh');
  });

  it('asks which solution to filter when the workspace holds more than one', async () => {
    ui = driveUi({ quickPicks: [cancel()] });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    assert.equal(ui.quickPicks.length, 1, 'the flow stops on a dismissed solution pick');
    assert.deepEqual(ui.quickPicks[0]?.labels, ['Contoso.sln', 'Contoso.slnx']);
    assert.deepEqual(ui.quickPicks[0]?.descriptions, ['sln', 'slnx']);
  });

  it('writes the dependency closure, the covering test project, and nothing else', async () => {
    ui = driveUi({
      quickPicks: [pick('Contoso.sln'), pickMany('Contoso.App')],
      inputs: ['Contoso.App.slnf'],
      answerMessage: () => undefined,
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');
    ui.assertFullyConsumed();

    const document = await readFilter('Contoso.App.slnf');
    assert.equal(document.solution.path, 'Contoso.sln');
    assert.deepEqual(document.solution.projects, [
      'src\\Contoso.App\\Contoso.App.csproj',
      'src\\Contoso.Core\\Contoso.Core.csproj',
      'tests\\Contoso.App.Tests\\Contoso.App.Tests.csproj',
    ]);

    const summary = ui.messagesOfKind('info');
    assert.equal(summary.length, 1);
    assert.equal(
      summary[0]!.message,
      'Contoso.App.slnf: 3 project(s), including 1 test project(s), 1 left out as absent from the solution',
    );
    assert.deepEqual(summary[0]!.actions, ['Apply now', 'Open file']);
  });

  it('suggests a file name taken from the first selected project', async () => {
    ui = driveUi({
      quickPicks: [pick('Contoso.sln'), pickMany('Contoso.App')],
      inputs: [undefined],
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    assert.equal(ui.inputBoxes.length, 1);
    assert.equal(ui.inputBoxes[0]?.value, 'Contoso.App.slnf');
    assert.equal(await fileExists(inWorkspace('Contoso.App.slnf')), false, 'a dismissed name writes nothing');
  });

  it('follows a conditional reference only under the configuration it is guarded by', async () => {
    await setConfiguration('Local');

    ui = driveUi({
      quickPicks: [pick('Contoso.sln'), pickMany('Contoso.App')],
      inputs: ['Local.slnf'],
      answerMessage: () => undefined,
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    const document = await readFilter('Local.slnf');
    assert.deepEqual(document.solution.projects, [
      'src\\Contoso.App\\Contoso.App.csproj',
      'src\\Contoso.Core\\Contoso.Core.csproj',
      'src\\Contoso.Extras\\Contoso.Extras.csproj',
      'tests\\Contoso.App.Tests\\Contoso.App.Tests.csproj',
    ]);
  });

  it('leaves test projects out when asked to', async () => {
    await setIncludeTestProjects(false);

    ui = driveUi({
      quickPicks: [pick('Contoso.sln'), pickMany('Contoso.App')],
      inputs: ['NoTests.slnf'],
      answerMessage: () => undefined,
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    const document = await readFilter('NoTests.slnf');
    assert.deepEqual(document.solution.projects, [
      'src\\Contoso.App\\Contoso.App.csproj',
      'src\\Contoso.Core\\Contoso.Core.csproj',
    ]);
  });

  /*
   * The .slnx here holds three projects where the .sln holds six, which is what makes
   * the result proof that the picked solution is the one that was read: no test project
   * can be added, because this solution contains none.
   */
  it('filters an .slnx over that solution own project set', async () => {
    ui = driveUi({
      quickPicks: [pick('Contoso.slnx'), pickMany('Contoso.App')],
      inputs: ['FromSlnx.slnf'],
      answerMessage: () => undefined,
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    const document = await readFilter('FromSlnx.slnf');
    assert.equal(document.solution.path, 'Contoso.slnx');
    assert.deepEqual(document.solution.projects, [
      'src\\Contoso.App\\Contoso.App.csproj',
      'src\\Contoso.Core\\Contoso.Core.csproj',
    ]);

    const summary = ui.messagesOfKind('info')[0]?.message ?? '';
    assert.match(summary, /^FromSlnx\.slnf: 2 project\(s\)/);
    assert.doesNotMatch(summary, /test project/);
  });

  it('shows which solution folder a project sits in, nested folders included', async () => {
    ui = driveUi({ quickPicks: [pick('Contoso.slnx'), cancel()] });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    assert.deepEqual(ui.quickPicks[1]?.labels, [
      'Contoso.App',
      'Contoso.Core',
      'Contoso.Unrelated',
    ]);
    assert.deepEqual(ui.quickPicks[1]?.descriptions, ['src', '1 - Libs/Core', 'src']);
  });

  it('asks before overwriting an existing filter and honours a refusal', async () => {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(inWorkspace('Contoso.App.slnf')),
      new TextEncoder().encode('{ "kept": true }\n'),
    );

    ui = driveUi({
      quickPicks: [pick('Contoso.sln'), pickMany('Contoso.App')],
      inputs: ['Contoso.App.slnf'],
      answerMessage: () => undefined,
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    const warnings = ui.messagesOfKind('warning');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.message, /already exists/);
    assert.equal(await readTextFile(inWorkspace('Contoso.App.slnf')), '{ "kept": true }\n');
  });

  it('reports the missing C# extension when the new filter is applied right away', async () => {
    ui = driveUi({
      quickPicks: [pick('Contoso.sln'), pickMany('Contoso.Core')],
      inputs: ['Contoso.App.slnf'],
      answerMessage: (message) => (message.actions.includes('Apply now') ? 'Apply now' : undefined),
    });

    await vscode.commands.executeCommand('solutionScope.generateFilter');

    assert.deepEqual(ui.messagesOfKind('error'), [], 'no raw settings error should surface');
    assert.equal(ui.messagesOfKind('warning').length, 1);
    assert.match(ui.messagesOfKind('warning')[0]!.message, /ms-dotnettools\.csharp/);
    assert.equal(scopeSetting(), undefined);
  });
});

async function readFilter(name: string): Promise<FilterDocument> {
  return JSON.parse(await readTextFile(inWorkspace(name))) as FilterDocument;
}

async function setConfiguration(value: string | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('solutionScope')
    .update('configuration', value, vscode.ConfigurationTarget.Workspace);
}

async function setIncludeTestProjects(value: boolean | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('solutionScope')
    .update('includeTestProjects', value, vscode.ConfigurationTarget.Workspace);
}
