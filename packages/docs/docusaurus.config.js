// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.oneDark;

// dracula
// duotoneDark
// duotoneLight
// github
// jettwaveDark
// jettwaveLight
// nightOwl
// nightOwlLight
// oceanicNext
// okaidia
// oneDark
// oneLight
// palenight
// shadesOfPurple
// synthwave84
// ultramin
// vsDark
// vsLight

const path = require('path');

console.log(`isCI: ${process.env.CI}`);

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: 'Dockview',
    tagline:
        'A zero dependency layout manager supporting React, Vue, Angular, and vanilla TypeScript',
    url: 'https://dockview.dev',
    baseUrl: process.env.CI ? `/` : '/',
    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'warn',
    favicon: 'img/brand/dockview-favicon.svg',

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: 'dockview', // Usually your GitHub org/user name.
    projectName: 'dockview', // Usually your repo name.

    // Even if you don't use internalization, you can use this field to set useful
    // metadata like html lang. For example, if your site is Chinese, you may want
    // to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },
    // Serve both the docs-local `static` directory and the repository root
    // `static` directory. Shared assets referenced from package READMEs live in
    // the root `static/` so their links stay resilient to docs restructuring.
    staticDirectories: ['static', path.resolve(__dirname, '../../static')],
    stylesheets: [
        {
            href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
        },
        {
            href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
            rel: 'stylesheet',
        },
    ],
    plugins: [
        'docusaurus-plugin-sass',
        [
            '@docusaurus/plugin-client-redirects',
            {
                // Pages consolidated during the v8 docs restructure. Keep these
                // so existing bookmarks and inbound links don't 404.
                redirects: [
                    {
                        from: '/docs/core/groups/resizing',
                        to: '/docs/core/panels/resizing',
                    },
                    {
                        from: '/docs/core/groups/locked',
                        to: '/docs/core/locked',
                    },
                    {
                        from: '/docs/core/groups/hiddenHeader',
                        to: '/docs/core/groups/controls',
                    },
                    {
                        from: '/docs/other/tabview',
                        to: '/docs/core/dnd/disable',
                    },
                ],
            },
        ],
        (context, options) => {
            return {
                name: 'custom-webpack',
                configureWebpack: (config, isServer, utils) => {
                    return {
                        // externals: ['react', 'react-dom'],
                        devtool: 'source-map',
                        module: {
                            rules: [
                                {
                                    test: /\.js$/,
                                    enforce: 'pre',
                                    use: ['source-map-loader'],
                                },
                            ],
                        },
                        resolve: {
                            ...config.resolve,
                            alias: {
                                ...config.resolve.alias,
                                ...(process.env.NODE_ENV !== 'production' && {
                                    'dockview-core$': path.join(
                                        __dirname,
                                        '../dockview-core/src'
                                    ),
                                    dockview$: path.join(
                                        __dirname,
                                        '../dockview/src'
                                    ),
                                    // Without this, dockview-enterprise resolves to
                                    // its built dist/, so editing module source
                                    // (e.g. auto-hide edge groups) does nothing
                                    // until a rebuild + dev-server restart.
                                    'dockview-enterprise$': path.join(
                                        __dirname,
                                        '../dockview-enterprise/src'
                                    ),
                                }),
                                react: path.join(
                                    __dirname,
                                    '../../node_modules',
                                    'react'
                                ),
                                'react-dom': path.join(
                                    __dirname,
                                    '../../node_modules',
                                    'react-dom'
                                ),
                            },
                        },
                    };
                },
            };
        },
    ],
    // Consent-gated analytics: this module shows the cookie banner and only
    // loads Google Analytics after the visitor opts in. Shared with the
    // enterprise app so one choice covers the whole dockview.dev domain.
    clientModules: [require.resolve('./src/consent.js')],
    presets: [
        [
            'classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    sidebarPath: require.resolve('./sidebars.js'),
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    // editUrl:
                    //     'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                    // versions: {
                    //     current: {
                    //         label: `Development 🚧`,
                    //     },
                    // },
                },
                blog: {
                    // showReadingTime: true,
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    // editUrl:
                    //     'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                },
                theme: {
                    customCss: require.resolve('./src/css/custom.scss'),
                },
                // Google Analytics is now loaded by src/consent.js, and only
                // after the visitor accepts analytics cookies. The built-in
                // fire-on-load gtag plugin is intentionally not used, so GA is
                // not loaded before consent (PECR, shared privacy policy).
            }),
        ],
    ],

    headTags: [
        {
            tagName: 'link',
            attributes: {
                rel: 'icon',
                type: 'image/svg+xml',
                href: '/img/brand/dockview-favicon.svg',
            },
        },
        {
            tagName: 'link',
            attributes: {
                rel: 'icon',
                type: 'image/png',
                sizes: '32x32',
                href: '/img/brand/favicon-32.png',
            },
        },
        {
            tagName: 'link',
            attributes: {
                rel: 'icon',
                type: 'image/png',
                sizes: '16x16',
                href: '/img/brand/favicon-16.png',
            },
        },
        {
            tagName: 'link',
            attributes: {
                rel: 'apple-touch-icon',
                sizes: '180x180',
                href: '/img/brand/apple-touch-icon-180.png',
            },
        },
        {
            tagName: 'script',
            attributes: {
                type: 'application/ld+json',
            },
            innerHTML: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'SoftwareSourceCode',
                name: 'Dockview',
                description:
                    'A zero dependency docking layout manager for building IDE-like interfaces with tabs, groups, grids, splitviews, drag and drop, floating panels, and popout windows. Touch and mobile ready. Supports React, Vue, Angular, and vanilla TypeScript.',
                url: 'https://dockview.dev',
                codeRepository: 'https://github.com/dockview/dockview',
                programmingLanguage: ['TypeScript', 'JavaScript'],
                runtimePlatform: ['Browser'],
                license: 'https://opensource.org/licenses/MIT',
                operatingSystem: 'Any',
                applicationCategory: 'DeveloperApplication',
                keywords: [
                    'layout manager',
                    'docking',
                    'tabs',
                    'drag and drop',
                    'react',
                    'vue',
                    'angular',
                    'typescript',
                    'splitview',
                    'gridview',
                    'floating panels',
                    'popout windows',
                    'touch',
                    'mobile',
                    'zero dependency',
                ],
            }),
        },
    ],

    themeConfig:
        /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
        ({
            image: 'img/brand/og-image-1200x630.png',
            metadata: [
                {
                    name: 'keywords',
                    content: [
                        'react',
                        'vue',
                        'vue3',
                        'angular',
                        'components',
                        'typescript',
                        'drag-and-drop',
                        'reactjs',
                        'layout',
                        'drag',
                        'drop',
                        'tabs',
                        'dock',
                        'docking',
                        'splitter',
                        'docking-library',
                        'layout-manager',
                        'docking-layout',
                        'zero-dependency',
                        'ide-layout',
                        'floating-panels',
                        'popout-windows',
                        'touch',
                        'mobile',
                    ].join(' ,'),
                },
                {
                    name: 'description',
                    content:
                        'Dockview is a zero dependency docking layout manager for building IDE-like interfaces with tabs, groups, grids, splitviews, drag and drop, floating panels, and popout windows. Touch and mobile ready. Supports React, Vue, Angular, and vanilla TypeScript.',
                },
                {
                    property: 'og:type',
                    content: 'website',
                },
                {
                    name: 'twitter:card',
                    content: 'summary_large_image',
                },
            ],
            docs: {
                sidebar: {
                    autoCollapseCategories: true,
                },
            },
            navbar: {
                title: 'Dockview',
                logo: {
                    alt: 'Dockview logo',
                    // Single constant-colour mark (teal/blue/rose/purple) that
                    // reads on light, cream and navy alike, so the same file is
                    // used in both themes. srcDark is set explicitly so
                    // Docusaurus doesn't hide the (light-only) logo in dark mode.
                    src: 'img/brand/dockview-mark.svg',
                    srcDark: 'img/brand/dockview-mark.svg',
                },
                items: [
                    {
                        type: 'search',
                        position: 'right',
                    },
                    {
                        to: '/newsletter',
                        label: 'Newsletter',
                        position: 'right',
                    },
                    {
                        type: 'doc',
                        docId: 'overview/introduction',
                        position: 'right',
                        label: 'Docs',
                    },
                    {
                        type: 'docSidebar',
                        position: 'right',
                        sidebarId: 'api',
                        label: 'API',
                    },
                    { to: '/blog', label: 'Blog', position: 'right' },
                    {
                        to: '/examples',
                        label: 'Examples',
                        position: 'right',
                    },
                    { to: '/demo', label: 'Demo', position: 'right' },
                    {
                        // The in-site licensing / edition-comparison page. Its
                        // "Purchase a licence" CTA links out to the separate
                        // marketing deployment at /enterprise.
                        to: '/docs/overview/licence',
                        label: 'Licensing',
                        position: 'right',
                    },
                    {
                        href: 'https://github.com/dockview/dockview',
                        position: 'right',
                        className: 'header-github-link',
                        'aria-label': 'GitHub repository',
                    },
                ],
            },
            footer: {
                style: 'light',
                links: [
                    {
                        title: 'Documentation',
                        items: [
                            {
                                label: 'Get Started',
                                to: '/docs/overview/introduction',
                            },
                            {
                                label: "What's new",
                                to: '/whats-new',
                            },
                            {
                                label: 'Demo',
                                to: '/demo',
                            },
                        ],
                    },
                    {
                        title: 'Dockview',
                        items: [
                            {
                                label: 'Sitemap',
                                href: 'pathname:///sitemap.xml',
                                target: '_self',
                            },
                            {
                                label: 'Licensing',
                                to: '/docs/overview/licence',
                            },
                            {
                                label: 'Contact us',
                                to: '/contact',
                            },
                            {
                                // /enterprise is the separate worker deployment,
                                // not a Docusaurus route, so use pathname:// to
                                // keep the broken-link checker from validating it
                                // (same as the sitemap link above).
                                label: 'Privacy policy',
                                href: 'pathname:///enterprise/privacy',
                                target: '_self',
                            },
                            {
                                // Opens the cookie-consent preferences modal
                                // (vanilla-cookieconsent auto-binds the data-cc
                                // attribute), letting visitors change or
                                // withdraw analytics consent at any time.
                                html: '<button type="button" class="footer__link-item" data-cc="show-preferencesModal" style="background:none;border:0;padding:0;font:inherit;cursor:pointer;text-align:left">Cookie settings</button>',
                            },
                        ],
                    },
                    {
                        title: 'Follow',
                        items: [
                            {
                                label: 'GitHub',
                                href: 'https://github.com/dockview/dockview',
                            },
                            {
                                label: 'LinkedIn',
                                href: 'https://www.linkedin.com/company/dockviewjs',
                            },
                        ],
                    },
                ],
                // Registered name is "Dockview Ltd" (Companies House no.
                // 17326398), not "Dockview, Inc." The registered office address
                // was deliberately dropped from this disclosure; the registered
                // name, number and place of registration remain. Keep in step
                // with LICENSOR_DISCLOSURE in the dockview-licencing repo
                // (src/lib/legal.ts).
                copyright: `Copyright © ${new Date().getFullYear()} Dockview Ltd<br /><span style="opacity:0.7;font-size:0.85em">Dockview Ltd, registered in England and Wales (no. 17326398).</span>`,
            },
            prism: {
                theme: lightCodeTheme,
                darkTheme: darkCodeTheme,
                additionalLanguages: ['markdown', 'latex', 'diff'],
                magicComments: [
                    {
                        className: 'theme-code-block-highlighted-line',
                        line: 'highlight-next-line',
                        block: {
                            start: 'highlight-start',
                            end: 'highlight-end',
                        },
                    },
                    {
                        className: 'code-block-error-line',
                        line: 'This will error',
                    },
                ],
            },
            announcementBar: {
                id: 'announcementBar', // Increment on change
                content: `⭐️ If you like Dockview, give it a star on <a target="_blank" rel="noopener noreferrer" href="https://github.com/dockview/dockview">GitHub</a>`,
            },
            tableOfContents: {
                maxHeadingLevel: 5,
            },
            algolia: {
                appId: 'BA8M6MXEG4',
                apiKey: 'faaf190a8d1ac5d3a4e2c984eb457ea8',
                indexName: 'Documentation Website',
                contextualSearch: true,
                searchPagePath: 'search',
            },
        }),
};

module.exports = config;
