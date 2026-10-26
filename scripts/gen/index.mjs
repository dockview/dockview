import { generatePackageExports } from './package-exports.mjs';

const generators = [
    {
        name: 'dockview-core-exports',
        fn: () => generatePackageExports('dockview-core'),
    },
    {
        name: 'dockview-enterprise-exports',
        fn: () =>
            generatePackageExports('dockview-enterprise', { ownOnly: true }),
    },
];

for (const gen of generators) {
    console.log(`Running generator: ${gen.name}`);
    gen.fn();
    console.log(`Done: ${gen.name}`);
}
