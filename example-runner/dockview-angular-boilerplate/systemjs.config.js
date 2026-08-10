/**
 * SystemJS configuration for Dockview Angular examples.
 * Uses plugin-typescript with decorator support for browser-side transpilation.
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
            target: 'es2020',
            emitDecoratorMetadata: true,
            experimentalDecorators: true,
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
                tslib: 'npm:tslib@2.3.1/tslib.js',
                typescript: 'npm:typescript@4.4/lib/typescript.min.js',

                app: defined_dockview_appLocation,

                '@angular/core': 'npm:@angular/core@17.0.0/fesm2022/core.mjs',
                '@angular/core/primitives/signals':
                    'npm:@angular/core@17.0.0/fesm2022/primitives/signals.mjs',
                '@angular/common':
                    'npm:@angular/common@17.0.0/fesm2022/common.mjs',
                '@angular/common/http':
                    'npm:@angular/common@17.0.0/fesm2022/http.mjs',
                '@angular/compiler':
                    'npm:@angular/compiler@17.0.0/fesm2022/compiler.mjs',
                '@angular/platform-browser':
                    'npm:@angular/platform-browser@17.0.0/fesm2022/platform-browser.mjs',
                '@angular/platform-browser/animations':
                    'npm:@angular/platform-browser@17.0.0/fesm2022/animations.mjs',
                '@angular/platform-browser-dynamic':
                    'npm:@angular/platform-browser-dynamic@17.0.0/fesm2022/platform-browser-dynamic.mjs',
                rxjs: 'npm:rxjs@7.8.1/dist/bundles/rxjs.umd.min.js',
                'rxjs/operators': 'npm:rxjs@7.8.1/dist/bundles/rxjs.umd.min.js',
                'zone.js': 'npm:zone.js@0.14.3/fesm2015/zone.min.js',
            },
            defined_dockview_systemJsMap
        ),
        packages: {
            css: {},
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
            // Point `dockview` at its rollup bundle via an explicit `main`, so
            // SystemJS doesn't request the bare package directory, which 404s
            // (previously a fatal EISDIR) in the dev server. The bundle requires
            // only `dockview-core`, mapped above.
            dockview: {
                main: './dist/package/main.cjs.js',
                format: 'cjs',
                defaultExtension: 'js',
            },
            'dockview-angular': {
                main: './dist/fesm2022/dockview-angular.mjs',
                defaultExtension: 'mjs',
            },
        },
    });
})(window);
