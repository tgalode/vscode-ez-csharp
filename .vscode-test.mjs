import * as os from 'node:os';
import * as path from 'node:path';
import { defineConfig } from '@vscode/test-cli';

/*
 * The test host puts its control socket inside --user-data-dir, and a Unix socket path
 * is capped at 103 characters. The default location under .vscode-test/ blows that cap
 * on any repository checked out a few directories deep, so the profile lives in the
 * temporary directory, under a deliberately short name.
 */
const userDataDir = path.join(os.platform() === 'darwin' ? '/tmp' : os.tmpdir(), 'vsc-scope-test');

const workspaceFolder = 'tests/fixtures/workspace';
const mocha = { ui: 'bdd', timeout: 30000 };

/*
 * Two runs, because the one setting that narrows the language server belongs to the C#
 * extension and VS Code refuses to write a setting no installed extension declares.
 *
 * - `integration` runs without it, and is the default: fast, and it covers the degraded
 *   path a user without the C# extension actually gets.
 * - `csharp` installs ms-dotnettools.csharp, which is the only way to observe what is
 *   really written to dotnet.defaultSolution and to check the restart command still
 *   exists under the id the extension calls.
 */
export default defineConfig([
  {
    label: 'integration',
    files: 'out/tests/integration/**/*.itest.js',
    workspaceFolder,
    launchArgs: ['--disable-extensions', `--user-data-dir=${userDataDir}`],
    mocha,
  },
  {
    label: 'csharp',
    files: 'out/tests/integration-csharp/**/*.itest.js',
    workspaceFolder,
    installExtensions: ['ms-dotnettools.csharp'],
    launchArgs: [`--user-data-dir=${userDataDir}`],
    mocha,
  },
  {
    label: 'multi-root',
    files: 'out/tests/integration-multiroot/**/*.itest.js',
    workspaceFolder: 'tests/fixtures/multi-root.code-workspace',
    installExtensions: ['ms-dotnettools.csharp'],
    launchArgs: [`--user-data-dir=${userDataDir}`],
    mocha,
  },
]);
