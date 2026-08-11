// @ts-check
/**
 * Bundle the real /demo trading panels for the marketing recorder.
 *
 * Compiles `demo-dockview/src/harnessPanels.tsx` (React + the actual demo panel
 * components + market simulation) into a single self-contained IIFE that the
 * movie harness loads as `harness/panels.bundle.js`. It exposes
 * `window.MovieWidgets.mount(el, kind, title)`, the same surface the harness
 * calls, so the recorder renders the genuine product panels.
 *
 *   yarn build:harness-panels     # from packages/docs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
    entryPoints: [
        path.resolve(
            __dirname,
            '../../sandboxes/react/dockview/demo-dockview/src/harnessPanels.tsx'
        ),
    ],
    bundle: true,
    format: 'iife',
    minify: true,
    outfile: path.resolve(__dirname, 'harness/panels.bundle.js'),
    loader: { '.tsx': 'tsx' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
});

console.log('✓ built scripts/record/harness/panels.bundle.js');
