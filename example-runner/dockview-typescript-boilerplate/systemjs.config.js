/**
 * SystemJS configuration for Dockview TypeScript examples.
 *
 * Expects the following globals to be set before this script loads:
 *   - window.defined_dockview_systemJsMap  (package URL map, local or CDN)
 *   - window.defined_dockview_appLocation  (base URL for example source files)
 */
(function (global) {
    var defined_dockview_systemJsMap = global.defined_dockview_systemJsMap;
    var defined_dockview_appLocation = global.defined_dockview_appLocation;

    System.config({
        transpiler: 'ts',
        typescriptOptions: {
            target: 'es2015',
            module: 'system',
            moduleResolution: 'node',
        },
        meta: {
            typescript: {
                exports: 'ts',
            },
            '*.css': { loader: 'css' },
        },
        paths: {
            'npm:': 'https://cdn.jsdelivr.net/npm/',
        },
        map: Object.assign(
            {
                css: '/example-runner/css.js',
                ts: 'npm:plugin-typescript@8.0.0/lib/plugin.js',
                typescript: 'npm:typescript@5.4.5/lib/typescript.min.js',

                app: defined_dockview_appLocation,
            },
            defined_dockview_systemJsMap
        ),
        packages: {
            app: {
                defaultExtension: 'ts',
            },
            // dockview-core is resolved transitively via `dockview`;
            // dockview-enterprise is imported directly for its named exports
            // (e.g. `LicenseManager`). Both resolve to the rolldown
            // `dist/package` bundle, which sets `__esModule` (via rolldown's
            // `esModule: true`). SystemJS 0.21 only exposes named exports from a
            // CJS module when that marker is present.
            'dockview-core': {
                main: './dist/package/main.cjs.js',
                format: 'cjs',
                defaultExtension: 'js',
            },
            'dockview-enterprise': {
                main: './dist/package/main.cjs.js',
                format: 'cjs',
                defaultExtension: 'js',
            },
            // Examples import from `dockview` directly. Give it an explicit
            // `main` (its rollup bundle) so SystemJS doesn't request the bare
            // package directory, which 404s (previously a fatal EISDIR) in the
            // dev server. The bundle requires only `dockview-core`, mapped above.
            dockview: {
                main: './dist/package/main.cjs.js',
                format: 'cjs',
                defaultExtension: 'js',
            },
        },
    });
})(window);
