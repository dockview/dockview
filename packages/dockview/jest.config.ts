import type { Config } from 'jest';

const config: Config = {
    roots: ['<rootDir>/packages/dockview'],
    modulePaths: ['<rootDir>/packages/dockview/src'],
    displayName: { name: 'dockview', color: 'blue' },
    rootDir: '../../',
    collectCoverageFrom: [
        '<rootDir>/packages/dockview/src/**/*.{js,jsx,ts,tsx}',
    ],
    setupFiles: [],
    setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
    // Report coverage only for this package. `moduleNameMapper` points the
    // other dockview packages at their source, so specs here load those files
    // and jest emits a second, near-empty coverage map for each; merging the
    // two instrumentations of one file overwrites the real counters.
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/packages/(?!dockview/)[^/]+/src/',
    ],
    moduleNameMapper: {
        '^dockview-core$': '<rootDir>/packages/dockview-core/src/index.ts',
        '^dockview-enterprise$':
            '<rootDir>/packages/dockview-enterprise/src/index.ts',
    },
    modulePathIgnorePatterns: [],
    coverageDirectory: '<rootDir>/packages/dockview/coverage/',
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
