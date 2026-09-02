import type { Config } from 'jest';

const config: Config = {
    preset: 'jest-preset-angular',
    roots: ['<rootDir>/packages/dockview-angular'],
    modulePaths: ['<rootDir>/packages/dockview-angular/src'],
    displayName: { name: 'dockview-angular', color: 'blue' },
    rootDir: '../../',
    collectCoverageFrom: [
        '<rootDir>/packages/dockview-angular/src/**/*.{js,jsx,ts,tsx}',
        '!<rootDir>/packages/dockview-angular/src/**/__tests__/**',
        '!<rootDir>/packages/dockview-angular/src/**/index.ts',
        '!<rootDir>/packages/dockview-angular/src/public-api.ts',
    ],
    setupFilesAfterEnv: [
        '<rootDir>/packages/dockview-angular/src/__tests__/setup-jest.ts',
    ],
    // Report coverage only for this package. The Angular preset instruments
    // TypeScript differently from the @swc/jest projects, so when this project
    // also reported the `dockview-core` sources it maps in, merging the two
    // instrumentations of the same file produced garbage counters - branches
    // taken hundreds of times came out as never taken.
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/packages/(?!dockview-angular/)[^/]+/src/',
    ],
    moduleNameMapper: {
        '^dockview$': '<rootDir>/packages/dockview/src/index.ts',
        '^dockview-core$': '<rootDir>/packages/dockview-core/src/index.ts',
        '^dockview-enterprise$':
            '<rootDir>/packages/dockview-enterprise/src/index.ts',
    },
    modulePathIgnorePatterns: [
        '<rootDir>/packages/dockview-angular/src/__tests__/__mocks__',
        '<rootDir>/packages/dockview-angular/src/__tests__/__test_utils__',
    ],
    coverageDirectory: '<rootDir>/packages/dockview-angular/coverage/',
    // testResultsProcessor inherited from root config
    testEnvironment: 'jsdom',
    testMatch: [
        '<rootDir>/packages/dockview-angular/src/**/*.spec.ts',
        '<rootDir>/packages/dockview-angular/src/**/*.test.ts',
    ],
    transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|@angular|rxjs))'],
    transform: {
        '^.+\\.(ts|mjs|js|html)$': [
            'jest-preset-angular',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
                stringifyContentPathRegex: '\\.(html|svg)$',
            },
        ],
    },
};

export default config;
