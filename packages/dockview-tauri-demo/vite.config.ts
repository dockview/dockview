import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/**
 * Tauri drives this config in two modes: `tauri dev` points the webview at the
 * dev server on a fixed port, `tauri build` consumes `dist/`.
 */
export default defineConfig({
    // Tauri owns the terminal during `tauri dev`.
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        watch: {
            ignored: ['**/src-tauri/**'],
        },
    },
    build: {
        // Match the oldest webviews Tauri targets: WKWebView on macOS and
        // WebKitGTK on the older LTS distributions.
        target: ['es2021', 'chrome105', 'safari14'],
        sourcemap: true,
        rollupOptions: {
            input: {
                // dockview's popout groups open `/popout.html` by default, so
                // the host has to actually serve it.
                main: entry('./index.html'),
                popout: entry('./popout.html'),
            },
        },
    },
});
