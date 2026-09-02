import type { Config } from 'jest';

const config: Config = {
    roots: ['<rootDir>/packages/dockview-react'],
    modulePaths: ['<rootDir>/packages/dockview-react/src'],
    displayName: { name: 'dockview-react', color: 'blue' },
    rootDir: '../../',
    collectCoverageFrom: [
        '<rootDir>/packages/dockview-react/src/**/*.{js,jsx,ts,tsx}',
    ],
    setupFiles: [
        '<rootDir>/packages/dockview-react/src/__tests__/__mocks__/resizeObserver.js',
    ],
    setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
    // Report coverage only for this package. `moduleNameMapper` points the
    // other dockview packages at their source, so specs here load those files
    // and jest emits a second, near-empty coverage map for each; merging the
    // two instrumentations of one file overwrites the real counters.
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/packages/(?!dockview-react/)[^/]+/src/',
    ],
    moduleNameMapper: {
        '^dockview-core$': '<rootDir>/packages/dockview-core/src/index.ts',
        '^dockview$': '<rootDir>/packages/dockview/src/index.ts',
        '^dockview-enterprise$':
            '<rootDir>/packages/dockview-enterprise/src/index.ts',
    },
    modulePathIgnorePatterns: [
        '<rootDir>/packages/dockview-react/src/__tests__/__mocks__',
        '<rootDir>/packages/dockview-react/src/__tests__/__test_utils__',
    ],
    coverageDirectory: '<rootDir>/packages/dockview-react/coverage/',
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
