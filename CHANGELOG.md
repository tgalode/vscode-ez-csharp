# Changelog

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
