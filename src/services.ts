import type { Discovery } from './workspace/discovery';
import type { Log } from './workspace/log';
import type { ScopeManager } from './workspace/scopeManager';
import type { ScopeStatusBar } from './workspace/statusBar';
import type { WorkspaceFileSystem } from './workspace/fileSystem';

/** Everything the commands need, passed explicitly so nothing reaches for a global. */
export interface Services {
  discovery: Discovery;
  scope: ScopeManager;
  statusBar: ScopeStatusBar;
  files: WorkspaceFileSystem;
  log: Log;
  /** Re-reads the pinned scope and repaints the status bar. */
  refreshStatusBar(): void;
}
