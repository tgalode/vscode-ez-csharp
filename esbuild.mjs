import { build, context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  /*
   * Prefer the ESM build of a dependency over its `main`. jsonc-parser ships a UMD
   * `main` whose factory receives `require` as a parameter, which no bundler can resolve
   * statically: esbuild leaves `require("./impl/format")` as a runtime call and the
   * extension then fails to activate on a module that was never bundled. Its ESM build
   * has plain imports. Packages carrying an `exports` map, fast-xml-parser among them,
   * are unaffected: that map wins over these fields.
   */
  mainFields: ['module', 'main'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
