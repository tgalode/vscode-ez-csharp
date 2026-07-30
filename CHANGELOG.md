# Changelog

## 0.2.1

Three defects found by running the commands in a real extension host for the first time.

- Applying a scope no longer fails with `Unable to write to Workspace Settings because
  dotnet.defaultSolution is not a registered configuration`. That setting belongs to the
  C# extension, and VS Code refuses to write a setting no installed extension declares,
  so without it every scope change ended in a settings-layer error. `Switch Scope`,
  `Clear Scope` and applying a freshly generated filter now say the C# extension is
  missing, which is both true and actionable.
- In a multi-root workspace the picker listed solutions by bare file name, so two folders
  each holding a `Contoso.sln` produced two indistinguishable entries. Labels now carry
  the folder name when there is more than one root, and stay short when there is one.
- `Clear Scope` reported success while having changed nothing, for the same registration
  reason as above.

## 0.2.0

Fixes a defect that produced polluted filters.

- `ProjectReference` entries guarded by an MSBuild `Condition` are now evaluated
  instead of being followed unconditionally. A repository that wires neighbouring
  source repositories through a dedicated configuration, and consumes them as NuGet
  packages otherwise, no longer sees those projects pulled into every filter. Measured
  on a real solution, the closure of one application went from 24 projects to 11 in
  `Debug`, and still resolves to 24 under the configuration that does wire them.
- New `solutionScope.configuration` setting, `Debug` by default, selects the
  configuration the graph is resolved for.
- A condition outside the supported subset, a property function or a boolean operator,
  keeps the reference and reports it in the log. Dropping a real dependency yields a
  filter that does not load, so undecidable means keep.

## 0.1.0

First version.

- Status bar item showing the pinned scope, with a picker over every solution and filter
  found in the workspace.
- Filter generation from a project selection, resolving the `ProjectReference` closure and
  optionally pulling in the test projects that cover the selection.
- Validation of a filter against its parent solution and the disk before pinning it.
- Reads `.sln`, `.slnx` and `.slnf`. Never writes to `.sln` or `.slnx`.
