# Manual check

Everything that can be automated runs under `npm run test:integration*`. This list holds
what is left: the things a test cannot judge, either because the API does not expose them
or because they need a real solution and a running language server.

Run it before publishing a release. Ten minutes, on a solution with enough projects that
loading all of them is visibly slow.

## Setup

1. Open the extension in VS Code and press F5. A second window opens with the extension
   loaded.
2. In that window, open a real .NET solution of a few dozen projects.
3. Make sure `ms-dotnettools.csharp` is installed and enabled there.

## Does it actually narrow what loads

This is the product's only promise, and no test asserts it.

- [ ] With no scope pinned, open the C# output channel and note how many projects the
      server reports loading, and how long it takes.
- [ ] Generate a filter for one application, apply it, and read the same numbers again.
      Fewer projects, faster.
- [ ] Open a file belonging to a project the filter excludes. IntelliSense should be
      absent or degraded there, which is the expected consequence of a narrower scope.
- [ ] Run `dotnet build` on the generated `.slnf` from a terminal. It should build, and it
      should not build the excluded projects.

## The visible surface

- [ ] The status bar shows the pinned file name, left side, with a filter icon. Its
      tooltip names the scope.
- [ ] Clicking it opens the picker.
- [ ] The picker groups solutions and filters under separators, marks the active entry
      with a check, and offers `No scope` first.
- [ ] Long paths stay readable. A deeply nested filter should not push the useful part of
      the label out of view.
- [ ] `Generate Solution Filter` shows the project list sorted, with the solution folder
      as description and the relative path as detail, and filtering by typing part of a
      path works.
- [ ] The overwrite prompt is modal, and dismissing it leaves the existing file untouched.
- [ ] Turning `ezsharp.statusBar.enabled` off hides the item immediately, without a
      reload.
- [ ] Open a `.slnf` naming a project the solution does not contain. The entry is
      underlined, the Problems panel holds one error mentioning `MSB5028`, and fixing the
      line clears it without saving.
- [ ] The `ezsharp` icon appears in the activity bar and opens the `Slice` view.
- [ ] Ticking a project adds its dependencies underneath, each showing which chosen project
      brings it, and the view badge counts up.
- [ ] Unticking it empties the slice again.
- [ ] A project pulled in by a dependency shows unticked. Ticking it adds the tests that
      cover it.
- [ ] Solution folders appear as folders, nested ones included, and every project of the
      solution is listed whether or not it is in the slice.
- [ ] On a solution of several dozen projects, ticking feels immediate.

## Restarting for real

- [ ] Switching scope restarts the language server: the C# output channel shows it
      stopping and starting.
- [ ] With `ezsharp.restartLanguageServerOnSwitch` set to false, it does not, and
      the log says the scope was applied without a restart.

## Scale

- [ ] On the largest solution at hand, the picker opens without a perceptible wait.
- [ ] Generating a filter over a wide selection shows the progress notification and
      finishes in a few seconds.
- [ ] The log holds no unexpected diagnostics: unevaluated conditions and unreadable
      projects should be rare and explainable.

## Degraded cases

- [ ] Disable the C# extension for the workspace, then switch scope. The warning names
      `ms-dotnettools.csharp` and nothing raw from the settings layer appears.
- [ ] Open a folder with no solution at all. `Switch Scope` says so calmly.
