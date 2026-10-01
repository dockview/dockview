import * as path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom lacks the encoders the Sass compiler's protocol layer needs.
Object.assign(globalThis, { TextEncoder, TextDecoder });
// Loaded after the polyfill above, hence `require` rather than `import`.
const { compile } = require('sass-embedded') as typeof import('sass-embedded');

/**
 * The theme contract: a theme is a set of CSS custom properties. Every rule
 * the theme stylesheet writes for a theme or utility class must be that class
 * alone, declaring only `--dv-*` properties (plus `color-scheme`); all
 * rendering lives in core, driven by those properties. This keeps every
 * built-in theme reproducible, and restylable, with CSS variables alone.
 */

interface Rule {
    selectors: string[];
    declarations: [string, string][];
}

function parseRules(css: string): Rule[] {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules: Rule[] = [];

    const walk = (text: string): void => {
        let i = 0;
        while (i < text.length) {
            const open = text.indexOf('{', i);
            if (open === -1) {
                return;
            }
            const prelude = text.slice(i, open).trim();
            let depth = 1;
            let j = open + 1;
            while (depth > 0 && j < text.length) {
                if (text[j] === '{') depth++;
                else if (text[j] === '}') depth--;
                j++;
            }
            const body = text.slice(open + 1, j - 1);
            if (prelude.startsWith('@')) {
                if (!prelude.startsWith('@property')) {
                    walk(body);
                }
            } else {
                rules.push({
                    selectors: prelude.split(',').map((s) => s.trim()),
                    declarations: body
                        .split(';')
                        .map((d) => d.trim())
                        .filter(Boolean)
                        .map((d) => {
                            const colon = d.indexOf(':');
                            return [
                                d.slice(0, colon).trim(),
                                d.slice(colon + 1).trim(),
                            ] as [string, string];
                        }),
                });
            }
            i = j;
        }
    };

    walk(source);
    return rules;
}

const THEME_CLASS = /\.dockview-(theme-[\w-]+|spaced|tabs-connected)\b/;

describe('theme stylesheet', () => {
    const css = compile(path.join(__dirname, '..', '..', 'theme.scss')).css;
    const rules = parseRules(css);

    const declarationsOf = (className: string): Map<string, string> => {
        const map = new Map<string, string>();
        for (const rule of rules) {
            if (rule.selectors.includes(className)) {
                for (const [property, value] of rule.declarations) {
                    map.set(property, value);
                }
            }
        }
        return map;
    };

    test('theme and utility classes only declare custom properties', () => {
        const offending: string[] = [];
        for (const rule of rules) {
            for (const selector of rule.selectors) {
                if (!THEME_CLASS.test(selector)) {
                    continue;
                }
                if (!/^\.dockview-[\w-]+$/.test(selector)) {
                    offending.push(`selector ${selector}`);
                }
                for (const [property] of rule.declarations) {
                    if (
                        !property.startsWith('--') &&
                        property !== 'color-scheme'
                    ) {
                        offending.push(`${selector} { ${property} }`);
                    }
                }
            }
        }
        expect(offending).toEqual([]);
    });

    const spaced = [
        '.dockview-spaced',
        '.dockview-theme-abyss-spaced',
        '.dockview-theme-light-spaced',
        '.dockview-theme-nord-spaced',
        '.dockview-theme-catppuccin-mocha-spaced',
        '.dockview-theme-solarized-light-spaced',
        '.dockview-theme-github-dark-spaced',
        '.dockview-theme-github-light-spaced',
    ];

    test.each(spaced)('%s declares the spaced settings', (className) => {
        const d = declarationsOf(className);
        expect(d.get('--dv-spacing-padding')).toBe('10px');
        expect(d.get('--dv-group-gap')).toBe('var(--dv-spacing-padding)');
        expect(d.get('--dv-tabs-and-actions-container-height')).toBe('32px');
        expect(d.get('--dv-dnd-overlay-mounting')).toBe('absolute');
        expect(d.get('--dv-dnd-panel-overlay')).toBe('group');
        expect(d.get('--dv-dnd-tab-indicator')).toBe('line');
        expect(d.get('--dv-drag-over-border')).toMatch(
            /^2px solid var\(--dv-active-sash-color\b/
        );
    });

    test.each([
        '.dockview-theme-slate',
        '.dockview-theme-slate-dark',
    ])('%s declares the sheet settings', (className) => {
        const d = declarationsOf(className);
        expect(d.get('--dv-group-gap')).toBe('8px');
        expect(d.get('--dv-tabs-and-actions-container-height')).toBe('32px');
        expect(d.get('--dv-dnd-tab-indicator')).toBe('line');
        expect(d.get('--dv-tab-shoulder-size')).toBe('10px');
    });

    test('dark rounded declares its drop settings', () => {
        const d = declarationsOf('.dockview-theme-dark-rounded');
        expect(d.get('--dv-dnd-tab-indicator')).toBe('line');
        expect(d.get('--dv-drag-over-border')).toMatch(
            /^2px solid var\(--dv-active-sash-color\b/
        );
    });

    test('visual studio collapses edge groups to its 22px strip', () => {
        expect(
            declarationsOf('.dockview-theme-vs').get(
                '--dv-tabs-and-actions-container-height'
            )
        ).toBe('22px');
    });

    test('abyss uses the flat tab group indicator', () => {
        expect(
            declarationsOf('.dockview-theme-abyss').get(
                '--dv-tab-group-indicator'
            )
        ).toBe('none');
    });
});
