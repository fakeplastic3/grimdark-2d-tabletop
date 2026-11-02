// Dependency-free test loader for the installed Node 26 runtime.
// Production bundles still use Vite/TypeScript. This hook does not type-check.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      const original = new URL(specifier, context.parentURL);
      if (original.protocol === 'file:' && !/\.[a-z]+$/i.test(original.pathname)) {
        for (const suffix of ['.ts', '/index.ts']) {
          const url = new URL(original.href + suffix);
          if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'strip', sourceUrl: url });
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
