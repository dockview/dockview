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
    // Report coverage only for this package. `moduleNameMapper` points the
    // other dockview packages at their source, so specs here load those files
    // and jest emits a second, near-empty coverage map for each; merging the
    // two instrumentations of one file overwrites the real counters.
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/packages/(?!dockview-enterprise/)[^/]+/src/',
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
