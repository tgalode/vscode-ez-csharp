import type { SolutionModel } from '../model/types';
import { absoluteProjectPaths } from '../model/solutionReader';
import { pathKey } from '../model/paths';
import type { Slice, SliceMember } from './slice';

export interface SliceFolderNode {
  kind: 'folder';
  label: string;
  children: SliceNode[];
}

export interface SliceProjectNode {
  kind: 'project';
  label: string;
  absolutePath: string;
  /** Root the user chose, which is what the checkbox reflects. */
  chosen: boolean;
  /** Its presence in the slice. Absent when it is not part of it. */
  member?: SliceMember;
}

export type SliceNode = SliceFolderNode | SliceProjectNode;

interface Branch {
  folders: Map<string, Branch>;
  projects: SliceProjectNode[];
}

/**
 * Derives the displayed tree from a solution and the slice being composed.
 *
 * Every project of the solution appears, member or not: the view is there to choose, not
 * only to contemplate a result. The hierarchy follows the solution folders so a project
 * sits where its author filed it.
 *
 * This lives apart from the view because VS Code offers no way to read back what a tree
 * rendered: computed here, the shape is verifiable without a host.
 */
export function buildSliceTree(
  solution: SolutionModel,
  slice: Slice,
  chosenRoots: ReadonlySet<string>,
): SliceNode[] {
  const memberByPath = new Map(
    slice.members.map((member) => [pathKey(member.absolutePath), member]),
  );
  const absolutePaths = absoluteProjectPaths(solution);
  const root: Branch = { folders: new Map(), projects: [] };

  for (const [index, entry] of solution.projects.entries()) {
    const absolutePath = absolutePaths[index];
    if (absolutePath === undefined) {
      continue;
    }

    const member = memberByPath.get(pathKey(absolutePath));
    const node: SliceProjectNode = {
      kind: 'project',
      label: entry.name,
      absolutePath,
      chosen: chosenRoots.has(pathKey(absolutePath)),
      ...(member === undefined ? {} : { member }),
    };

    branchFor(root, entry.folder).projects.push(node);
  }

  return flatten(root);
}

/** Descends, creating as needed, the branch `folder` names (`1 - Libs/Core`). */
function branchFor(root: Branch, folder: string | undefined): Branch {
  if (folder === undefined || folder === '') {
    return root;
  }

  let current = root;
  for (const segment of folder.split('/')) {
    if (segment === '') {
      continue;
    }
    let next = current.folders.get(segment);
    if (next === undefined) {
      next = { folders: new Map(), projects: [] };
      current.folders.set(segment, next);
    }
    current = next;
  }
  return current;
}

/** Folders first, then projects, each group sorted by label. */
function flatten(branch: Branch): SliceNode[] {
  const folders: SliceNode[] = [...branch.folders.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, child]) => ({ kind: 'folder', label, children: flatten(child) }));

  const projects = [...branch.projects].sort((left, right) =>
    left.label.localeCompare(right.label),
  );

  return [...folders, ...projects];
}
