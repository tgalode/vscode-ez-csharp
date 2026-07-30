import * as vscode from 'vscode';

/**
 * Drives the interactive parts of the extension from a test.
 *
 * The test runs inside the extension host, so it shares the one `vscode` module
 * instance with the extension under test. Replacing a `vscode.window` function here
 * intercepts the real call the command makes, which is what lets a quick pick or an
 * input box be answered without a human.
 */

export interface RecordedMessage {
  kind: 'info' | 'warning' | 'error';
  message: string;
  actions: string[];
}

export interface RecordedQuickPick {
  title: string | undefined;
  placeHolder: string | undefined;
  canPickMany: boolean;
  /** Labels as shown, separators included, in display order. */
  labels: string[];
  /** Descriptions, aligned with `labels`. */
  descriptions: (string | undefined)[];
}

export interface RecordedInputBox {
  title: string | undefined;
  prompt: string | undefined;
  value: string | undefined;
}

/** Answers one `showQuickPick` call: returns the item, the items, or undefined to cancel. */
export type QuickPickAnswer = (items: readonly vscode.QuickPickItem[]) => unknown;

export interface UiScript {
  /** One answer per `showQuickPick` call, in order. */
  quickPicks?: QuickPickAnswer[];
  /** One answer per `showInputBox` call, in order. */
  inputs?: (string | undefined)[];
  /** Picks an action label on a message, or undefined to dismiss it. */
  answerMessage?: (message: RecordedMessage) => string | undefined;
}

export class Ui {
  readonly messages: RecordedMessage[] = [];
  readonly quickPicks: RecordedQuickPick[] = [];
  readonly inputBoxes: RecordedInputBox[] = [];

  private readonly originals = new Map<string, unknown>();
  private quickPickIndex = 0;
  private inputIndex = 0;

  constructor(private readonly script: UiScript) {}

  install(): void {
    this.patch('showQuickPick', async (items: unknown, options: vscode.QuickPickOptions = {}) => {
      const resolved = (await items) as readonly vscode.QuickPickItem[];
      this.quickPicks.push({
        title: (options as { title?: string }).title,
        placeHolder: options.placeHolder,
        canPickMany: options.canPickMany === true,
        labels: resolved.map((item) => item.label),
        descriptions: resolved.map((item) => item.description),
      });

      const answer = this.script.quickPicks?.[this.quickPickIndex];
      this.quickPickIndex += 1;
      if (answer === undefined) {
        throw new Error(
          `Unscripted quick pick #${this.quickPickIndex}: ${resolved.map((item) => item.label).join(', ')}`,
        );
      }
      return answer(resolved);
    });

    this.patch('showInputBox', async (options: vscode.InputBoxOptions = {}) => {
      this.inputBoxes.push({
        title: (options as { title?: string }).title,
        prompt: options.prompt,
        value: options.value,
      });

      const answer = this.script.inputs?.[this.inputIndex];
      this.inputIndex += 1;

      // The command validates what a human would have typed, so honour the validator.
      if (typeof answer === 'string' && options.validateInput !== undefined) {
        const verdict = await options.validateInput(answer);
        if (verdict !== undefined && verdict !== null) {
          throw new Error(`Scripted input "${answer}" was rejected: ${JSON.stringify(verdict)}`);
        }
      }
      return answer;
    });

    for (const [name, kind] of [
      ['showInformationMessage', 'info'],
      ['showWarningMessage', 'warning'],
      ['showErrorMessage', 'error'],
    ] as const) {
      this.patch(name, async (message: string, ...rest: unknown[]) => {
        const actions = rest.filter((item): item is string => typeof item === 'string');
        const recorded: RecordedMessage = { kind, message, actions };
        this.messages.push(recorded);
        return this.script.answerMessage?.(recorded);
      });
    }
  }

  restore(): void {
    for (const [name, original] of this.originals) {
      (vscode.window as unknown as Record<string, unknown>)[name] = original;
    }
    this.originals.clear();
  }

  /** Messages of one kind, in order, for assertions that do not care about the rest. */
  messagesOfKind(kind: RecordedMessage['kind']): RecordedMessage[] {
    return this.messages.filter((message) => message.kind === kind);
  }

  /** Fails when a scripted answer was never consumed, which means the flow ended early. */
  assertFullyConsumed(): void {
    const pending = (this.script.quickPicks?.length ?? 0) - this.quickPickIndex;
    if (pending > 0) {
      throw new Error(`${pending} scripted quick pick answer(s) were never used.`);
    }
    const pendingInputs = (this.script.inputs?.length ?? 0) - this.inputIndex;
    if (pendingInputs > 0) {
      throw new Error(`${pendingInputs} scripted input answer(s) were never used.`);
    }
  }

  private patch(name: string, implementation: (...args: never[]) => unknown): void {
    const window = vscode.window as unknown as Record<string, unknown>;
    this.originals.set(name, window[name]);
    window[name] = implementation;
  }
}

/** Installs the scripted UI and returns it. Call `restore()` in a teardown hook. */
export function driveUi(script: UiScript): Ui {
  const ui = new Ui(script);
  ui.install();
  return ui;
}

/**
 * Picks an item by label: an exact match when there is one, otherwise the single item
 * containing `text`. Exact wins because a solution holds names that prefix each other,
 * `Contoso.App` and `Contoso.App.Tests` among them.
 */
export function pick(text: string): QuickPickAnswer {
  return (items) => {
    const candidates = selectable(items);
    const exact = candidates.filter((item) => item.label === text);
    if (exact.length === 1) {
      return exact[0];
    }

    const matches = candidates.filter((item) => item.label.includes(text));
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one item matching "${text}", found ${matches.length} in: ${items
          .map((item) => item.label)
          .join(', ')}`,
      );
    }
    return matches[0];
  };
}

/** Picks several items, for a `canPickMany` quick pick. */
export function pickMany(...texts: string[]): QuickPickAnswer {
  return (items) => texts.map((text) => pick(text)(items));
}

/** Dismisses the quick pick, as pressing Escape would. */
export function cancel(): QuickPickAnswer {
  return () => undefined;
}

function selectable(items: readonly vscode.QuickPickItem[]): vscode.QuickPickItem[] {
  return items.filter((item) => item.kind !== vscode.QuickPickItemKind.Separator);
}
