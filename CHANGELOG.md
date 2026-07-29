# Changelog

## 0.1.0

First version.

- Status bar item showing the pinned scope, with a picker over every solution and filter
  found in the workspace.
- Filter generation from a project selection, resolving the `ProjectReference` closure and
  optionally pulling in the test projects that cover the selection.
- Validation of a filter against its parent solution and the disk before pinning it.
- Reads `.sln`, `.slnx` and `.slnf`. Never writes to `.sln` or `.slnx`.
