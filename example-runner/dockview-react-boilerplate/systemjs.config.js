/**
 * SystemJS configuration for Dockview React examples.
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
            jsx: 'react',
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

                react: 'npm:react@18.2.0/umd/react.production.min.js',
                'react-dom':
                    'npm:react-dom@18.2.0/umd/react-dom.production.min.js',
                'react-dom/client':
                    'npm:react-dom@18.2.0/umd/react-dom.production.min.js',
            },
            defined_dockview_systemJsMap
        ),
        packages: {
            app: {
                defaultExtension: 'tsx',
            },
            // dockview-core, dockview-react and dockview-enterprise are imported
            // directly by example code via ES named imports (e.g.
            // `LicenseManager` from enterprise), and `dockview` is required by
            // dockview-react. All resolve to the rolldown `dist/package` bundle,
            // which sets `__esModule` (via rolldown's `esModule: true`).
            // SystemJS 0.21 only exposes named exports from a CJS module when
            // that marker is present.
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
            dockview: {
                main: './dist/package/main.cjs.js',
                format: 'cjs',
                defaultExtension: 'js',
            },
            'dockview-react': {
                main: './dist/package/main.cjs.js',
                format: 'cjs',
                defaultExtension: 'js',
            },
        },
    });
})(window);
