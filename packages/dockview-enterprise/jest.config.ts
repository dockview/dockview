import type { Config } from 'jest';

const config: Config = {
    roots: ['<rootDir>/packages/dockview-enterprise'],
    modulePaths: ['<rootDir>/packages/dockview-enterprise/src'],
    displayName: { name: 'dockview-enterprise', color: 'blue' },
    rootDir: '../../',
    collectCoverageFrom: [
        '<rootDir>/packages/dockview-enterprise/src/**/*.{js,jsx,ts,tsx}',
    ],
    setupFiles: [
        // ResizeObserver / PointerEvent are not implemented in jsdom; reuse the
        // core mocks.
        '<rootDir>/packages/dockview-core/src/__tests__/__mocks__/resizeObserver.js',
        '<rootDir>/packages/dockview-core/src/__tests__/__mocks__/pointerEvent.js',
    ],
    setupFilesAfterEnv: [
        '<rootDir>/jest-setup.ts',
        '<rootDir>/packages/dockview-enterprise/src/__tests__/registerModules.ts',
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        // `moduleNameMapper` points the dockview packages at their source, so
        // these specs load files from other packages and jest reports a second,
        // near-empty coverage map for each. Those maps are instrumented
        // differently to the owning project's, so the merged report overwrites
        // real coverage instead of adding to it. Report only this package.
        '<rootDir>/packages/dockview-core/',
        '<rootDir>/packages/dockview/src/',
    ],
    moduleNameMapper: {
        '^dockview-core$': '<rootDir>/packages/dockview-core/src/index.ts',
        // The enterprise source imports the base API from `dockview` (not
        // `dockview-core`), so map it to the dockview source too.
        '^dockview$': '<rootDir>/packages/dockview/src/index.ts',
        '^dockview-enterprise$':
            '<rootDir>/packages/dockview-enterprise/src/index.ts',
    },
    modulePathIgnorePatterns: [
        '<rootDir>/packages/dockview-enterprise/src/__tests__/registerModules.ts',
    ],
    coverageDirectory: '<rootDir>/packages/dockview-enterprise/coverage/',
    // testResultsProcessor inherited from root config
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.tsx?$': [
            '@swc/jest',
            {
                jsc: {
                    parser: { syntax: 'typescript', tsx: true },
                    transform: { react: { runtime: 'automatic' } },
                    target: 'es2021',
                },
            },
        ],
    },
};

export default config;
