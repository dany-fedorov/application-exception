// Vite config for the browser fixture. Deliberately has NO Node polyfill or shim plugin:
// if anything in the dependency closure reaches for a Node builtin, the build must fail loudly
// rather than silently succeed on a shim.
import { builtinModules } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function noNodeBuiltins() {
  let moduleIds = [];
  return {
    name: 'appex-no-node-builtins',
    enforce: 'pre',
    resolveId(source, importer) {
      if (BUILTINS.has(source)) {
        this.error(
          `Node builtin "${source}" reached the browser bundle (imported by ${
            importer ?? 'the entry'
          }). The browser fixture runs with no shims on purpose.`,
        );
      }
      return null;
    },
    buildEnd() {
      moduleIds = [...this.getModuleIds()].filter((id) => !id.startsWith('\0'));
    },
    writeBundle(options) {
      fs.writeFileSync(
        path.join(options.dir, 'modules.json'),
        JSON.stringify(moduleIds, null, 2),
      );
    },
  };
}

// `root` is supplied by the driver with --root: the fixture lives in a throwaway consumer
// directory, while this config (and Vite itself) stay in the repository.
export default defineConfig({
  plugins: [noNodeBuiltins()],
  build: {
    target: 'es2022',
    minify: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      // Nothing may be left external: a browser bundle has no resolver at runtime.
      external: () => false,
    },
  },
});
