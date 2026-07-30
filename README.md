# Solution Scope

Work on a slice of a large .NET solution instead of loading all of it.

Solution Scope generates `.slnf` solution filters, switches between them, and points the
C# language server at the one you picked. On a solution with dozens of projects, that is
the difference between an editor that responds and one that spends minutes indexing code
you are not touching.

## Why

The free [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp)
gives you IntelliSense, navigation and debugging. What it does not give you is a way to
narrow what gets loaded, beyond hand-editing a `dotnet.defaultSolution` setting and
hand-writing filter files. Solution filters have been supported by MSBuild for years and
by the `dotnet` CLI since SDK 9.0.200, but no editor tooling helps you produce them.

This extension fills that gap and nothing else. It does not replace the C# extension, and
it deliberately leaves the solution tree to
[vscode-solution-explorer](https://marketplace.visualstudio.com/items?itemName=fernandoescolar.vscode-solution-explorer),
which already does that well.

## What it does

**Switch scope.** A status bar item shows what the language server is loading. Click it to
pick any solution or filter found in the workspace. Solution Scope writes
`dotnet.defaultSolution` and restarts the language server.

**Generate a filter.** Pick a solution, then pick the projects you care about. Solution
Scope walks their `ProjectReference` graph, adds every dependency they need, optionally
adds the test projects that cover them, and writes the `.slnf` next to the solution.

**Explain a broken filter.** Before pinning a filter, Solution Scope checks each project
against the parent solution and against the disk, and tells you which entries are wrong.
Left to itself, MSBuild fails with a bare `MSB5028` and the language server reports
nothing useful.

## Requirements

The [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp)
(`ms-dotnettools.csharp`), which is free and has no per-organization licensing. C# Dev Kit
is not required. Filter generation works without any of them; only applying a scope needs
a language server to apply it to.

## Commands

| Command | What it does |
| --- | --- |
| `Solution Scope: Switch Scope` | Pick the solution or filter to load |
| `Solution Scope: Generate Solution Filter (.slnf)` | Build a filter from a project selection |
| `Solution Scope: Clear Scope` | Unpin, letting the C# extension choose again |
| `Solution Scope: Refresh Discovery` | Re-scan the workspace |
| `Solution Scope: Show Log` | Open the output channel with parse diagnostics |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `solutionScope.configuration` | `Debug` | MSBuild configuration used to resolve conditional references |
| `solutionScope.includeTestProjects` | `true` | Add test projects that reference the selection |
| `solutionScope.restartLanguageServerOnSwitch` | `true` | Restart the C# server after switching |
| `solutionScope.statusBar.enabled` | `true` | Show the current scope in the status bar |
| `solutionScope.exclude` | `**/{node_modules,bin,obj,.git}/**` | Paths ignored when discovering files |

## Notes on the formats

All three solution formats are read: the classic text `.sln`, the XML `.slnx` that
`dotnet new sln` produces by default since .NET 10, and `.slnf` filters.

Two behaviours are worth stating because they are easy to get wrong, and both are verified
against the .NET SDK rather than assumed:

- In a `.slnf`, `solution.path` is relative to the filter file, while every entry of
  `solution.projects` is relative to the **solution** directory. A filter in a
  subdirectory uses `../My.sln` next to `src/A/A.csproj`.
- MSBuild rejects a filter that names a project the parent solution does not contain. It
  does not skip it. Generated filters are therefore intersected with the solution.

Filters are written with backslash separators, matching what Visual Studio and Rider
produce. The SDK accepts either separator on every platform.

## Conditional references

A `ProjectReference` guarded by an MSBuild `Condition` is only followed when the
condition holds for `solutionScope.configuration`. This matters for repositories that
wire neighbouring source repositories under a dedicated configuration and consume them
as NuGet packages otherwise: following those references unconditionally pulls projects
into every filter that do not apply, and are often not even cloned.

The supported subset is a single `==` or `!=` comparison over properties, which is what
guards project references in practice. `Configuration` and `Platform` are known;
`Platform` defaults to `AnyCPU`, so the classic `'$(Configuration)|$(Platform)'` form
resolves. Anything else, a property function such as `Exists(...)`, a boolean operator,
or an unknown property, leaves the reference in place and is reported in the log.
Dropping a real dependency produces a filter that does not load, so an undecidable
condition means keep.

Nothing is ever written to your `.sln` or `.slnx` files.

## License

MIT
