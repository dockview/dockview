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
    coveragePathIgnorePatterns: [
        '/node_modules/',
        // `moduleNameMapper` points the dockview packages at their source, so
        // these specs load files from other packages and jest reports a second,
        // near-empty coverage map for each. Those maps are instrumented
        // differently to the owning project's, so the merged report overwrites
        // real coverage instead of adding to it. Report only this package.
        '<rootDir>/packages/dockview-core/',
        '<rootDir>/packages/dockview-enterprise/',
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
