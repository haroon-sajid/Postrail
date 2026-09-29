import { defineConfig } from 'tsup';

/**
 * One self-contained ESM file. Workspace packages ship TypeScript source (see ADR 0001),
 * so they must be bundled; third-party deps are bundled too so the Cloud Run image needs
 * no node_modules. Add anything that cannot be bundled (native addons) to `external`.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  external: [],
  // CommonJS deps (pino, dotenv) keep calling require() after bundling; ESM has none by default.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
