import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../services';
import type { SolutionModel } from '../model/types';
import { ProjectGraph } from '../model/projectGraph';
import { composeSlice, type Slice, type SliceMember } from '../filters/slice';
import { buildSliceTree, type SliceNode } from '../filters/sliceTree';
import { pathKey } from '../model/paths';
import { pickSolution, saveFilter } from '../commands/filterFlow';
import { applyScope } from '../commands/applyScope';

const VIEW_ID = 'ezsharp.slice';
const EMPTY: Slice = { members: [], excludedOutsideSolution: [], diagnostics: [] };

/**
 * Composing a slice by ticking projects, with what the selection entails shown as it goes.
 *
 * The checkbox says "I want this project", the label says why it is in: a project pulled in
 * by another shows unticked, with the root that brings it. Ticking an already pulled-in
 * project has a real effect, that of recalling its tests, so it must stay possible;
 * unticking a required dependency makes no sense, and this semantics removes the question.
 */
export class SliceView implements vscode.TreeDataProvider<SliceNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private readonly view: vscode.TreeView<SliceNode>;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly chosen = new Set<string>();

  private solution: SolutionModel | undefined;
  /** Kept between two ticks: its closures are memoised, recreating it would re-read everything. */
  private graph: ProjectGraph | undefined;
  private slice: Slice = EMPTY;
  private nodes: SliceNode[] = [];

  constructor(private readonly services: Services) {
    this.view = vscode.window.createTreeView<SliceNode>(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    this.subscriptions.push(
      this.view,
      this.changed,
      this.view.onDidChangeCheckboxState((event) => {
        for (const [node, state] of event.items) {
          if (node.kind !== 'project') {
            continue;
          }
          if (state === vscode.TreeItemCheckboxState.Checked) {
            this.chosen.add(pathKey(node.absolutePath));
          } else {
            this.chosen.delete(pathKey(node.absolutePath));
          }
        }
        void this.recompose();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('ezsharp.configuration') ||
          event.affectsConfiguration('ezsharp.includeTestProjects')
        ) {
          this.graph = undefined;
          void this.recompose();
        }
      }),
    );
  }

  getTreeItem(node: SliceNode): vscode.TreeItem {
    if (node.kind === 'folder') {
      const folder = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      folder.iconPath = new vscode.ThemeIcon('folder');
      return folder;
    }

    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(node.absolutePath);
    item.checkboxState = node.chosen
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.iconPath = new vscode.ThemeIcon(
      node.member === undefined ? 'circle-outline' : 'circle-filled',
    );
    const description = describe(node.member);
    if (description !== undefined) {
      item.description = description;
    }
    item.tooltip = new vscode.MarkdownString(`\`${node.absolutePath}\`\n\n${explain(node.member)}`);
    return item;
  }

  getChildren(node?: SliceNode): SliceNode[] {
    if (node === undefined) {
      return this.nodes;
    }
    return node.kind === 'folder' ? node.children : [];
  }

  /** Changes the solution the view composes from. */
  async selectSolution(): Promise<void> {
    const picked = await pickSolution(this.services);
    if (picked === undefined) {
      return;
    }
    this.solution = picked;
    this.graph = undefined;
    this.chosen.clear();
    await this.recompose();
  }

  async toggleProject(absolutePath: string): Promise<void> {
    const key = pathKey(absolutePath);
    if (this.chosen.has(key)) {
      this.chosen.delete(key);
    } else {
      this.chosen.add(key);
    }
    await this.recompose();
  }

  async reset(): Promise<void> {
    this.chosen.clear();
    await this.recompose();
  }

  async refresh(): Promise<void> {
    this.graph = undefined;
    await this.recompose();
  }

  /** Writes the slice to a `.slnf` and returns its URI, or undefined if the user backs out. */
  async save(): Promise<vscode.Uri | undefined> {
    if (this.solution === undefined) {
      void vscode.window.showInformationMessage('ezsharp: pick a solution first.');
      return undefined;
    }

    return saveFilter(this.services, {
      solutionAbsolutePath: this.solution.solutionPath,
      projectAbsolutePaths: this.slice.members.map((member) => member.absolutePath),
      suggestedName: `${this.firstChosenName() ?? 'slice'}.slnf`,
    });
  }

  async apply(): Promise<void> {
    const written = await this.save();
    if (written !== undefined) {
      await applyScope(this.services, written);
    }
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private firstChosenName(): string | undefined {
    const chosen = this.slice.members.find((member) => member.reason === 'chosen');
    return chosen === undefined ? undefined : basenameWithoutExtension(chosen.absolutePath);
  }

  private async recompose(): Promise<void> {
    if (this.solution === undefined) {
      this.slice = EMPTY;
      this.nodes = [];
      this.view.badge = undefined;
      this.view.message = 'Pick a solution to compose a slice from.';
      this.changed.fire();
      return;
    }

    const settings = vscode.workspace.getConfiguration('ezsharp');
    this.graph ??= new ProjectGraph(this.services.files, {
      configuration: settings.get<string>('configuration', 'Debug'),
    });

    this.slice = await composeSlice(this.solution, this.chosen, this.graph, {
      includeTestProjects: settings.get<boolean>('includeTestProjects', true),
    });
    this.services.log.diagnostics('Slice', this.slice.diagnostics);
    this.services.log.diagnostics('Project graph', this.graph.diagnostics);

    this.nodes = buildSliceTree(this.solution, this.slice, this.chosen);

    const total = this.solution.projects.length;
    const kept = this.slice.members.length;
    this.view.badge = { value: kept, tooltip: `${kept} of ${total} project(s) in the slice` };
    this.view.message = `${path.basename(this.solution.filePath)}: ${kept} of ${total} project(s)`;
    this.changed.fire();
  }
}

function describe(member: SliceMember | undefined): string | undefined {
  if (member === undefined) {
    return undefined;
  }
  switch (member.reason) {
    case 'chosen':
      return 'chosen';
    case 'dependency':
      return `via ${basenameWithoutExtension(member.via ?? '')}`;
    case 'coveringTest':
      return member.via === undefined
        ? 'test covering the slice'
        : `test covering ${basenameWithoutExtension(member.via)}`;
  }
}

function explain(member: SliceMember | undefined): string {
  if (member === undefined) {
    return 'Not in the slice. Tick it to add it, and its dependencies come along.';
  }
  switch (member.reason) {
    case 'chosen':
      return 'You chose this project. Its dependencies and the tests covering it follow.';
    case 'dependency':
      return 'In the slice because a project you chose needs it. Tick it to choose it too, which also pulls in the tests covering it.';
    case 'coveringTest':
      return 'A test project covering your selection.';
  }
}

function basenameWithoutExtension(absolutePath: string): string {
  return path.basename(absolutePath, path.extname(absolutePath));
}
