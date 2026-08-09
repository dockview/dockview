import fs from 'fs-extra';
import * as path from 'path';
import { argv } from 'process';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { version } = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, '..', '..', 'dockview', 'package.json')
    )
);

// Defaults to the published `dockview` version, but can be overridden via the
// DOCKVIEW_VERSION env var to build the live examples against a specific
// (e.g. experimental/prerelease) build for testing — without committing a
// version that would break the normal docs build.
const DOCKVIEW_VERSION = process.env.DOCKVIEW_VERSION || version;
const USE_LOCAL_CDN = argv.slice(2).includes('--local');

console.log(`[buildTemplates] using dockview version: ${DOCKVIEW_VERSION}`);

const local = 'http://localhost:1111';

const BOILERPLATE_PATH_PREFIX = '/example-runner/';

const FRAMEWORK_BOILERPLATE = {
    react: 'dockview-react-boilerplate',
    typescript: 'dockview-typescript-boilerplate',
    vue: 'dockview-vue-boilerplate',
    angular: 'dockview-angular-boilerplate',
};

const DOCKVIEW_CDN = {
    react: {
        remote: {
            'dockview-core': `https://cdn.jsdelivr.net/npm/dockview-core@${DOCKVIEW_VERSION}`,
            dockview: `https://cdn.jsdelivr.net/npm/dockview@${DOCKVIEW_VERSION}`,
            'dockview-enterprise': `https://cdn.jsdelivr.net/npm/dockview-enterprise@${DOCKVIEW_VERSION}`,
            'dockview-react': `https://cdn.jsdelivr.net/npm/dockview-react@${DOCKVIEW_VERSION}`,
        },
        local: {
            'dockview-core': `${local}/dockview-core`,
            dockview: `${local}/dockview`,
            'dockview-enterprise': `${local}/dockview-enterprise`,
            'dockview-react': `${local}/dockview-react`,
        },
    },
    vue: {
        remote: {
            // dockview-core is resolved transitively (dockview-vue -> dockview
            // -> dockview-core); it is not imported directly by user code.
            'dockview-core': `https://cdn.jsdelivr.net/npm/dockview-core@${DOCKVIEW_VERSION}`,
            dockview: `https://cdn.jsdelivr.net/npm/dockview@${DOCKVIEW_VERSION}`,
            'dockview-enterprise': `https://cdn.jsdelivr.net/npm/dockview-enterprise@${DOCKVIEW_VERSION}`,
            'dockview-vue': `https://cdn.jsdelivr.net/npm/dockview-vue@${DOCKVIEW_VERSION}`,
        },
        local: {
            'dockview-core': `${local}/dockview-core`,
            dockview: `${local}/dockview`,
            'dockview-enterprise': `${local}/dockview-enterprise`,
            'dockview-vue': `${local}/dockview-vue`,
        },
    },
    typescript: {
        remote: {
            // dockview-core is resolved transitively (dockview -> dockview-core);
            // it is not imported directly by user code.
            'dockview-core': `https://cdn.jsdelivr.net/npm/dockview-core@${DOCKVIEW_VERSION}`,
            dockview: `https://cdn.jsdelivr.net/npm/dockview@${DOCKVIEW_VERSION}`,
            'dockview-enterprise': `https://cdn.jsdelivr.net/npm/dockview-enterprise@${DOCKVIEW_VERSION}`,
        },
        local: {
            'dockview-core': `${local}/dockview-core`,
            dockview: `${local}/dockview`,
            'dockview-enterprise': `${local}/dockview-enterprise`,
        },
    },
    angular: {
        remote: {
            // dockview-core is resolved transitively (dockview-angular ->
            // dockview -> dockview-core); it is not imported directly by user code.
            'dockview-core': `https://cdn.jsdelivr.net/npm/dockview-core@${DOCKVIEW_VERSION}`,
            dockview: `https://cdn.jsdelivr.net/npm/dockview@${DOCKVIEW_VERSION}`,
            'dockview-enterprise': `https://cdn.jsdelivr.net/npm/dockview-enterprise@${DOCKVIEW_VERSION}`,
            'dockview-angular': `https://cdn.jsdelivr.net/npm/dockview-angular@${DOCKVIEW_VERSION}`,
        },
        local: {
            'dockview-core': `${local}/dockview-core`,
            dockview: `${local}/dockview`,
            'dockview-enterprise': `${local}/dockview-enterprise`,
            'dockview-angular': `${local}/dockview-angular`,
        },
    },
};

const START_FILE = {
    react: 'app/index.tsx',
    typescript: 'app/index.ts',
    vue: 'app/index.ts',
    angular: 'app/index.ts',
};

// The `main` file each mapped package resolves to, mirrored from the SystemJS
// boilerplates in static/example-runner/*/systemjs.config.js. Nothing fails
// loudly when a boilerplate points at a path the build no longer produces: the
// browser just 404s (or serves a stale orphan) at runtime. So the paths here
// must be kept in step with those boilerplates and are asserted below.
const PACKAGE_MAIN = {
    'dockview-core': 'dist/package/main.cjs.js',
    dockview: 'dist/package/main.cjs.js',
    'dockview-enterprise': 'dist/package/main.cjs.js',
    'dockview-react': 'dist/package/main.cjs.js',
    'dockview-vue': 'dist/dockview-vue.es.js',
    'dockview-angular': 'dist/fesm2022/dockview-angular.mjs',
};

// Set to bypass the resolution check (e.g. an offline build). Off by default:
// the whole point of the guard is to fail a docs build that would ship dead
// example imports.
const SKIP_MAIN_CHECK = process.env.SKIP_TEMPLATE_MAIN_CHECK === 'true';

// Every package mapped by any framework, deduped.
function mappedPackages() {
    const packages = new Set();
    for (const framework of FRAMEWORKS) {
        for (const pkg of Object.keys(DOCKVIEW_CDN[framework].remote)) {
            packages.add(pkg);
        }
    }
    return [...packages];
}

// Assert every mapped package `main` actually resolves before any template is
// written. --local checks the file on disk under the package's dist/; remote
// HEADs the CDN URL and fails on >= 400. The remote check catches both a stale
// mapping and a docs deploy that runs ahead of the npm publish (either of which
// would 404 every example that imports the package). Kept cheap: a handful of
// HEADs, run in parallel, honouring the DOCKVIEW_VERSION override.
async function assertMainsResolve() {
    if (SKIP_MAIN_CHECK) {
        console.warn(
            '[buildTemplates] SKIP_TEMPLATE_MAIN_CHECK set, skipping package main resolution check'
        );
        return;
    }

    const packages = mappedPackages();
    const failures = [];

    // Config drift: a package is mapped but has no known main file here.
    for (const pkg of packages) {
        if (!PACKAGE_MAIN[pkg]) {
            failures.push({
                pkg,
                where: `missing from PACKAGE_MAIN in ${path.basename(
                    fileURLToPath(import.meta.url)
                )}`,
            });
        }
    }

    if (USE_LOCAL_CDN) {
        for (const pkg of packages) {
            const rel = PACKAGE_MAIN[pkg];
            if (!rel) continue;
            const abs = path.join(__dirname, '..', '..', pkg, rel);
            if (!fs.existsSync(abs)) {
                failures.push({ pkg, where: abs });
            }
        }
    } else {
        await Promise.all(
            packages.map(async (pkg) => {
                const rel = PACKAGE_MAIN[pkg];
                if (!rel) return;
                const url = `https://cdn.jsdelivr.net/npm/${pkg}@${DOCKVIEW_VERSION}/${rel}`;
                try {
                    const res = await fetch(url, { method: 'HEAD' });
                    if (res.status >= 400) {
                        failures.push({ pkg, where: url, status: res.status });
                    }
                } catch (err) {
                    failures.push({ pkg, where: url, status: err.message });
                }
            })
        );
    }

    if (failures.length > 0) {
        const lines = failures.map((f) => {
            const status = f.status ? ` (${f.status})` : '';
            const version = USE_LOCAL_CDN ? 'local' : `@${DOCKVIEW_VERSION}`;
            return `  - ${f.pkg}${version} -> ${f.where}${status}`;
        });
        const hint = USE_LOCAL_CDN
            ? 'Build the packages first (npm run build && npm run build:bundle in each of dockview-core, dockview, dockview-react, dockview-enterprise).'
            : 'Check these versions are published to npm. The docs must not deploy ahead of the npm publish, or every example that imports the package 404s. Use DOCKVIEW_VERSION to test a prerelease.';
        throw new Error(
            `[buildTemplates] ${failures.length} mapped package main file(s) do not resolve:\n` +
                `${lines.join('\n')}\n${hint}`
        );
    }

    console.log(
        `[buildTemplates] verified ${packages.length} package main files resolve (${
            USE_LOCAL_CDN ? 'local disk' : `jsdelivr @${DOCKVIEW_VERSION}`
        })`
    );
}

const template = fs
    .readFileSync(path.join(__dirname, './template.html'))
    .toString();

function createIndexHTML(options) {
    return template
        .replace('{{title}}', options.title)
        .replace('{{appLocation}}', options.appLocation)
        .replace(/\{\{boilerplatePath\}\}/g, options.boilerplatePath)
        .replace('{{startFile}}', options.startFile)
        .replace('{{systemJsMap}}', JSON.stringify(options.systemJsMap))
        .replace('{{appElement}}', options.appElement || '')
        .replace('{{componentSelector}}', options.componentSelector)
        .replace('{{githubLink}}', options.githubUrl)
        .replace('{{codeSandboxLink}}', options.codeSandboxUrl);
}

const input_dir = path.join(__dirname, '../templates');
const output = path.join(__dirname, '../static/templates');

const COMPONENTS = ['dockview', 'splitview', 'gridview', 'paneview'];
const FRAMEWORKS = ['react', 'vue', 'typescript', 'angular'];

const COMPONENT_SELECTORS = {
    dockview: '.dv-dockview',
    splitview: '.dv-split-view-container',
    gridview: '.dv-grid-view',
    paneview: '.dv-pane-container',
};

const list = [];

const githubUrl =
    'https://github.com/dockview/dockview/tree/master/packages/docs/templates';
const codeSandboxUrl =
    'https://codesandbox.io/p/sandbox/github/dockview/dockview/tree/gh-pages/templates';

async function buildTemplates() {
    for (const component of COMPONENTS) {
        const componentDir = path.join(input_dir, component);

        const templates = fs.readdirSync(componentDir);

        for (const folder of templates) {
            for (const framework of FRAMEWORKS) {
                if (
                    !fs.existsSync(
                        path.join(componentDir, folder, framework, 'src')
                    )
                ) {
                    continue;
                }
                const srcPath = path.join(
                    componentDir,
                    folder,
                    framework,
                    'src'
                );
                const destPath = path.join(
                    output,
                    component,
                    folder,
                    framework,
                    'src'
                );

                // Copy all frameworks as-is (no special Angular transpilation)
                fs.copySync(srcPath, destPath);

                const templateGithubUrl = `${githubUrl}/${component}/${folder}/${framework}/src`;
                const templateCodeSandboxUrl = `${codeSandboxUrl}/${component}/${folder}/${framework}`;

                const boilerplateName = FRAMEWORK_BOILERPLATE[framework];
                const boilerplatePath = `${BOILERPLATE_PATH_PREFIX}${boilerplateName}/`;

                const systemJsMap =
                    DOCKVIEW_CDN[framework][USE_LOCAL_CDN ? 'local' : 'remote'];

                const html = createIndexHTML({
                    title: `Dockview | ${folder} ${framework}`,
                    appLocation: './src',
                    boilerplatePath: boilerplatePath,
                    startFile: START_FILE[framework],
                    systemJsMap: systemJsMap,
                    appElement:
                        framework === 'angular' ? '<app-root></app-root>' : '',
                    componentSelector: COMPONENT_SELECTORS[component],
                    githubUrl: templateGithubUrl,
                    codeSandboxUrl: templateCodeSandboxUrl,
                });
                fs.writeFileSync(
                    path.join(
                        output,
                        component,
                        folder,
                        framework,
                        'index.html'
                    ),
                    html
                );

                list.push({
                    name: `${component}/${framework}/${folder}`,
                    path: path.join(component, folder, framework, 'index.html'),
                });
            }
        }
    }

    const index = `<div>${list
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => {
            return `<div><a href=${`/templates/${item.path}`}>${
                item.name
            }</a></div>`;
        })
        .join('\n')}</div>`;

    fs.writeFileSync(path.join(output, 'index.html'), index);
}

// Run the build. Assert the mapped package main files resolve first, then
// generate the templates. Any failure must exit non-zero so a broken mapping or
// an unpublished version fails the docs build loudly rather than shipping dead
// example imports.
async function run() {
    await assertMainsResolve();
    await buildTemplates();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
