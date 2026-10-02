import type { DockviewTheme, DockviewThemeSettings } from 'dockview-react';
import { themeBase } from 'dockview-react';
import { themeConfig } from '../../config/theme.config';

/** Settings the builder can override; unset ones come from the theme's CSS. */
export type SettingOverrides = Pick<
    DockviewThemeSettings,
    | 'gap'
    | 'tabAnimation'
    | 'tabGroupIndicator'
    | 'dndOverlayMounting'
    | 'dndPanelOverlay'
    | 'dndTabIndicator'
>;

export interface BuilderState {
    /** Name of the theme the builder starts from. */
    base: string;
    /** Re-derive the base theme's colours from the base tokens. */
    derived: boolean;
    cards: boolean;
    connectedTabs: boolean;
    /** CSS custom properties set on the theme root, including `color-scheme`. */
    vars: Record<string, string>;
    settings: SettingOverrides;
}

export const THEMES: { theme: DockviewTheme; label: string }[] = themeConfig
    .map((c) => ({ theme: c.id as DockviewTheme, label: c.label }))
    // The base theme leads: it is the blank starting point.
    .sort((a, b) =>
        a.theme.name === themeBase.name
            ? -1
            : b.theme.name === themeBase.name
              ? 1
              : 0
    );

export const themeByName = (name: string): DockviewTheme =>
    THEMES.find((t) => t.theme.name === name)?.theme ?? themeBase;

export const isBase = (state: BuilderState) => state.base === themeBase.name;

/** Base colours apply: on the base theme, or with derived colours on. */
export const colorsDerive = (state: BuilderState) =>
    isBase(state) || state.derived;

export const initialState = (base = themeBase.name): BuilderState => ({
    base,
    derived: false,
    cards: false,
    connectedTabs: false,
    vars: {},
    settings: {},
});

export function classNameOf(state: BuilderState): string {
    const theme = themeByName(state.base);
    return [
        state.derived && !isBase(state) ? 'dockview-base-colors' : '',
        state.cards ? 'dockview-spaced' : '',
        state.connectedTabs ? 'dockview-tabs-connected' : '',
        theme.className,
    ]
        .filter(Boolean)
        .join(' ');
}

export function effectiveTheme(state: BuilderState): DockviewTheme {
    const theme = themeByName(state.base);
    const settings = Object.fromEntries(
        Object.entries(state.settings).filter(([, v]) => v !== undefined)
    );
    const scheme = state.vars['color-scheme'];
    return {
        ...theme,
        ...settings,
        name: `${theme.name}-builder`,
        className: classNameOf(state),
        colorScheme:
            scheme === 'light' || scheme === 'dark' ? scheme : theme.colorScheme,
    };
}

const importNameOf = (theme: DockviewTheme) =>
    `theme${theme.name.charAt(0).toUpperCase()}${theme.name.slice(1)}`;

const overrideEntries = (state: BuilderState) =>
    Object.entries(state.vars).filter(([, v]) => v !== '');

/** The CSS class holding the builder's custom properties. */
export function exportCss(state: BuilderState): string {
    const entries = overrideEntries(state);
    if (entries.length === 0) {
        return '/* No overrides: the theme object alone reproduces this theme. */\n';
    }
    const body = entries.map(([k, v]) => `    ${k}: ${v};`).join('\n');
    return `/* Load after dockview.css */\n.my-theme {\n${body}\n}\n`;
}

/** The theme object that applies the theme, its parts and the class. */
export function exportTs(state: BuilderState): string {
    const theme = themeByName(state.base);
    const importName = importNameOf(theme);
    const hasCss = overrideEntries(state).length > 0;
    const classes = [
        state.derived && !isBase(state) ? 'dockview-base-colors' : '',
        state.cards ? 'dockview-spaced' : '',
        state.connectedTabs ? 'dockview-tabs-connected' : '',
        `\${${importName}.className}`,
        hasCss ? 'my-theme' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const lines = [
        `import { DockviewTheme, ${importName} } from 'dockview';`,
        '',
        'const myTheme: DockviewTheme = {',
        `    ...${importName},`,
        `    name: 'my-theme',`,
    ];
    if (classes !== `\${${importName}.className}`) {
        lines.push(`    className: \`${classes}\`,`);
    }
    const scheme = state.vars['color-scheme'];
    if (scheme && scheme !== theme.colorScheme) {
        lines.push(`    colorScheme: '${scheme}',`);
    }
    for (const [key, value] of Object.entries(state.settings)) {
        if (value !== undefined) {
            lines.push(`    ${key}: ${JSON.stringify(value)},`);
        }
    }
    lines.push('};', '');
    return lines.join('\n');
}

// ── Share links ──────────────────────────────────────────────────────────────

export function encodeState(state: BuilderState): string {
    const json = JSON.stringify(state);
    return btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function decodeState(value: string): BuilderState | undefined {
    try {
        const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(escape(atob(b64)));
        const parsed = JSON.parse(json) as Partial<BuilderState>;
        if (typeof parsed.base !== 'string') return undefined;
        return {
            ...initialState(parsed.base),
            ...parsed,
            vars: { ...(parsed.vars ?? {}) },
            settings: { ...(parsed.settings ?? {}) },
        };
    } catch {
        return undefined;
    }
}

// ── Reading values back from the rendered preview ────────────────────────────

const channel = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0');

/** A computed colour as `#rrggbb`, `transparent`, or unchanged. */
export function toHex(computed: string): string {
    const rgb =
        /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(
            computed
        );
    const srgb =
        /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?/.exec(
            computed
        );
    const lab =
        /^oklab\(([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?/.exec(
            computed
        );
    let r: number, g: number, b: number, a: number;
    if (lab) {
        [r, g, b] = oklabToSrgb(
            Number(lab[1]),
            Number(lab[2]),
            Number(lab[3])
        );
        a = lab[4] === undefined ? 1 : Number(lab[4]);
    } else if (rgb) {
        [r, g, b] = rgb.slice(1, 4).map(Number);
        a = rgb[4] === undefined ? 1 : Number(rgb[4]);
    } else if (srgb) {
        [r, g, b] = srgb.slice(1, 4).map((c) => Number(c) * 255);
        a = srgb[4] === undefined ? 1 : Number(srgb[4]);
    } else {
        return computed;
    }
    return a === 0 ? 'transparent' : `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** OKLab to 0-255 sRGB (derived surfaces mix in oklab). */
function oklabToSrgb(L: number, A: number, B: number): number[] {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const linear = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return linear.map((c) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return v * 255;
    });
}

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

function probe<T>(root: HTMLElement, apply: (el: HTMLElement) => T): T {
    const el = document.createElement('div');
    el.style.display = 'none';
    root.appendChild(el);
    try {
        return apply(el);
    } finally {
        el.remove();
    }
}

/** Resolve a colour value (named, var(), color-mix()) against `root`. */
export const resolveColor = (root: HTMLElement, value: string) =>
    probe(root, (el) => {
        el.style.color = value;
        return toHex(getComputedStyle(el).color);
    });

/** Resolve a length value (calc(), var()) against `root` to px. */
export const resolveLength = (root: HTMLElement, value: string) =>
    probe(root, (el) => {
        el.style.width = value;
        const width = getComputedStyle(el).width;
        return width.endsWith('px') ? width : value;
    });

/**
 * The value in effect for `name` at `root`: its declared value resolved, or,
 * for a colour no rule declares, the colour of the element that uses it.
 */
export function effectiveValue(
    root: HTMLElement,
    name: string,
    kind: 'color' | 'length' | 'number' | 'text'
): string {
    const declared = getComputedStyle(root).getPropertyValue(name).trim();
    if (kind === 'color') {
        return declared ? resolveColor(root, declared) : '';
    }
    if (kind === 'length') {
        return declared ? resolveLength(root, declared) : '';
    }
    return declared;
}

// ── Deriving a built-in theme's colours ──────────────────────────────────────

const rgbOf = (hex: string) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

const saturation = (hex: string) => {
    const [r, g, b] = rgbOf(hex);
    return Math.max(r, g, b) - Math.min(r, g, b);
};

const luminance = (hex: string) => {
    const [r, g, b] = rgbOf(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Base colours approximating the theme rendered at `root`: background is its
 * content surface (cards, sheets) or group background; foreground its most
 * contrasting neutral tab text; accent its most saturated accent-like colour.
 */
export function seedColors(root: HTMLElement): Record<string, string> {
    const style = getComputedStyle(root);
    const colors = (...names: string[]) =>
        names
            .map((name) => style.getPropertyValue(name).trim())
            .filter(Boolean)
            .map((value) => resolveColor(root, value))
            .filter(isHexColor);
    const [content] = colors('--dv-content-background-color');
    const [group] = colors('--dv-group-view-background-color');
    const background = content ?? group;
    const text = colors(
        '--dv-activegroup-visiblepanel-tab-color',
        '--dv-inactivegroup-visiblepanel-tab-color',
        '--dv-activegroup-hiddenpanel-tab-color'
    );
    const neutral = text.filter((c) => saturation(c) < 48);
    const contrast = (c: string) =>
        background ? Math.abs(luminance(c) - luminance(background)) : 0;
    const [foreground] = (neutral.length ? neutral : text).sort(
        (a, b) => contrast(b) - contrast(a)
    );
    const [accent] = colors(
        '--dv-focus-ring-color',
        '--dv-paneview-active-outline-color',
        '--dv-active-sash-color',
        '--dv-activegroup-visiblepanel-tab-color'
    ).sort((a, b) => saturation(b) - saturation(a));
    const out: Record<string, string> = {};
    if (background) out['--dv-background-color'] = background;
    if (foreground) out['--dv-foreground-color'] = foreground;
    if (accent) out['--dv-accent-color'] = accent;
    return out;
}
