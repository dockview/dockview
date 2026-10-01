import * as React from 'react';
import {
    DockviewApi,
    DockviewTheme,
    ResolvedDockviewThemeSettings,
} from 'dockview-react';
import {
    ThemeBuilderState,
    ThemeCssOverrides,
    ThemeParts,
    generateCodeSnippet,
    isBaseTheme,
    resolveSettings,
} from './themeBuilder';
import { ToggleRow } from './toggleRow';
import { ControlsContent } from './settingsModal';
import { SB } from './sidebarTheme';
import {
    Card,
    Slider,
    Field,
    inputStyle,
    Btn,
    IconBtn,
    IconChip,
} from './sidebarKit';

// Collapsible section card. Thin wrapper over the kit `Card` so the many
// `<Section>` call sites below stay tidy; each maps a subject to an icon chip.
const Section = (props: {
    title: string;
    icon?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) => (
    <Card
        title={props.title}
        icon={props.icon ?? 'tune'}
        defaultOpen={props.defaultOpen ?? false}
    >
        {props.children}
    </Card>
);

// Numeric slider. The kit `Slider` already matches this call signature.
const SliderRow = Slider;

type SidebarTab = 'theme' | 'controls';

// THEME / CONTROLS as a full-width segmented pill (active segment = accent fill).
const TabToggle = (props: {
    active: SidebarTab;
    onChange: (tab: SidebarTab) => void;
}) => (
    <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
        <div
            style={{
                display: 'flex',
                background: SB.surface,
                border: `1px solid ${SB.border}`,
                borderRadius: SB.radiusSm,
                padding: 3,
                gap: 3,
            }}
        >
            {(
                [
                    ['theme', 'Theme'],
                    ['controls', 'Controls'],
                ] as [SidebarTab, string][]
            ).map(([id, label]) => {
                const active = props.active === id;
                return (
                    <button
                        key={id}
                        onClick={() => props.onChange(id)}
                        style={{
                            flex: 1,
                            padding: '6px 0',
                            fontSize: 11.5,
                            fontWeight: active ? 700 : 600,
                            fontFamily: SB.ui,
                            letterSpacing: '0.02em',
                            border: 'none',
                            borderRadius: 5,
                            cursor: 'pointer',
                            outline: 'none',
                            background: active ? SB.accent : 'transparent',
                            color: active ? SB.accentContrast : SB.muted,
                            boxShadow: active ? SB.glow : 'none',
                            transition: 'background 0.12s, color 0.12s',
                        }}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    </div>
);

// ── Reading what the dock actually renders ───────────────────────────────────

const findThemeRoot = (container: HTMLElement | null) =>
    container?.querySelector('[class*="dockview-theme"]') as HTMLElement | null;

// Derived tokens are not declared on the theme root (they resolve where they
// are used), so for those read the colour off an element that uses them.
const RENDERED: Partial<
    Record<keyof ThemeCssOverrides, [selector: string, property: string]>
> = {
    '--dv-group-view-background-color': ['.dv-groupview', 'background-color'],
    '--dv-tabs-and-actions-container-background-color': [
        '.dv-tabs-and-actions-container',
        'background-color',
    ],
    '--dv-activegroup-visiblepanel-tab-background-color': [
        '.dv-active-group .dv-tab.dv-active-tab',
        'background-color',
    ],
    '--dv-activegroup-visiblepanel-tab-color': [
        '.dv-active-group .dv-tab.dv-active-tab',
        'color',
    ],
    '--dv-activegroup-hiddenpanel-tab-background-color': [
        '.dv-active-group .dv-tab.dv-inactive-tab',
        'background-color',
    ],
    '--dv-activegroup-hiddenpanel-tab-color': [
        '.dv-active-group .dv-tab.dv-inactive-tab',
        'color',
    ],
    '--dv-inactivegroup-visiblepanel-tab-background-color': [
        '.dv-inactive-group .dv-tab.dv-active-tab',
        'background-color',
    ],
    '--dv-inactivegroup-visiblepanel-tab-color': [
        '.dv-inactive-group .dv-tab.dv-active-tab',
        'color',
    ],
    '--dv-inactivegroup-hiddenpanel-tab-background-color': [
        '.dv-inactive-group .dv-tab.dv-inactive-tab',
        'background-color',
    ],
    '--dv-inactivegroup-hiddenpanel-tab-color': [
        '.dv-inactive-group .dv-tab.dv-inactive-tab',
        'color',
    ],
};

const channel = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0');

/**
 * A computed colour as `#rrggbb`, or `transparent`. Browsers serialise
 * `color-mix()` results as `color(srgb r g b / a)`.
 */
const toHex = (computed: string): string => {
    const rgb = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(
        computed
    );
    const srgb =
        /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?/.exec(
            computed
        );
    let r: number, g: number, b: number, a: number;
    if (rgb) {
        [r, g, b] = rgb.slice(1, 4).map(Number);
        a = rgb[4] === undefined ? 1 : Number(rgb[4]);
    } else if (srgb) {
        [r, g, b] = srgb.slice(1, 4).map((c) => Number(c) * 255);
        a = srgb[4] === undefined ? 1 : Number(srgb[4]);
    } else {
        return computed;
    }
    return a === 0 ? 'transparent' : `#${channel(r)}${channel(g)}${channel(b)}`;
};

/** Resolve any CSS colour value (named, `var()`, `color-mix()`) to hex. */
const normaliseColor = (root: HTMLElement, value: string): string => {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    probe.style.color = value;
    root.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return toHex(computed);
};

/** The value in effect for each token, as shown in the builder. */
const readEffectiveValues = (
    root: HTMLElement,
    names: (keyof ThemeCssOverrides)[],
    colors: Set<string>
): Record<string, string> => {
    const style = getComputedStyle(root);
    const out: Record<string, string> = {};
    for (const name of names) {
        const declared = style.getPropertyValue(name).trim();
        if (declared) {
            out[name] = colors.has(name)
                ? normaliseColor(root, declared)
                : declared;
            continue;
        }
        const rendered = RENDERED[name];
        const el = rendered && root.querySelector(rendered[0]);
        if (rendered && el) {
            out[name] = toHex(getComputedStyle(el).getPropertyValue(rendered[1]));
        }
    }
    return out;
};

// ── Rows ──────────────────────────────────────────────────────────────────────

const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

const resetButton = (onClick: () => void) => (
    <button
        onClick={onClick}
        style={{
            background: 'none',
            border: 'none',
            color: SB.faint,
            cursor: 'pointer',
            padding: '0 2px',
            fontSize: 15,
            lineHeight: 1,
            flexShrink: 0,
        }}
        title="Back to the derived / theme value"
    >
        ×
    </button>
);

const ColorRow = (props: {
    label: string;
    value: string;
    effective: string;
    onChange: (v: string) => void;
}) => {
    const shown = props.value || props.effective;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 2px',
            }}
        >
            <input
                type="color"
                value={isHexColor(shown) ? shown : '#000000'}
                onChange={(e) => props.onChange(e.target.value)}
                style={{
                    width: 26,
                    height: 26,
                    padding: 2,
                    border: `1px solid ${SB.border}`,
                    borderRadius: SB.radiusChip,
                    cursor: 'pointer',
                    background: SB.inputBg,
                    flexShrink: 0,
                    opacity: props.value ? 1 : 0.7,
                }}
                title="Pick colour"
            />
            <span
                style={{
                    flex: 1,
                    fontSize: 12,
                    color: SB.text,
                    fontFamily: SB.ui,
                }}
            >
                {props.label}
            </span>
            <input
                type="text"
                className="dv-sb-input"
                value={props.value}
                placeholder={props.effective || 'auto'}
                onChange={(e) => props.onChange(e.target.value)}
                style={{
                    ...inputStyle,
                    width: 104,
                    flexShrink: 0,
                    color: SB.text,
                }}
            />
            {props.value && resetButton(() => props.onChange(''))}
        </div>
    );
};

const TextRow = (props: {
    label: string;
    value: string;
    effective: string;
    onChange: (v: string) => void;
}) => (
    <Field label={props.label}>
        <input
            type="text"
            className="dv-sb-input"
            value={props.value}
            placeholder={props.effective || 'auto'}
            onChange={(e) => props.onChange(e.target.value)}
            style={{ ...inputStyle, color: SB.text }}
        />
    </Field>
);

const Hint = (props: { children: React.ReactNode }) => (
    <div
        style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: SB.muted,
            padding: '2px 2px 6px',
        }}
    >
        {props.children}
    </div>
);

// Every token the builder shows; read together after each change.
const COLOR_TOKENS: (keyof ThemeCssOverrides)[] = [
    '--dv-background-color',
    '--dv-foreground-color',
    '--dv-accent-color',
    '--dv-group-view-background-color',
    '--dv-tabs-and-actions-container-background-color',
    '--dv-activegroup-visiblepanel-tab-background-color',
    '--dv-activegroup-hiddenpanel-tab-background-color',
    '--dv-inactivegroup-visiblepanel-tab-background-color',
    '--dv-inactivegroup-hiddenpanel-tab-background-color',
    '--dv-activegroup-visiblepanel-tab-color',
    '--dv-activegroup-hiddenpanel-tab-color',
    '--dv-inactivegroup-visiblepanel-tab-color',
    '--dv-inactivegroup-hiddenpanel-tab-color',
    '--dv-tab-divider-color',
    '--dv-separator-border',
    '--dv-paneview-header-border-color',
    '--dv-icon-hover-background-color',
    '--dv-drag-over-background-color',
    '--dv-active-sash-color',
    '--dv-sash-color',
    '--dv-tabs-container-scrollbar-color',
];
const OTHER_TOKENS: (keyof ThemeCssOverrides)[] = [
    '--dv-spacing',
    '--dv-border-radius',
    '--dv-spacing-padding',
    '--dv-tabs-and-actions-container-height',
    '--dv-tabs-and-actions-container-font-size',
    '--dv-tab-border-radius',
    '--dv-sash-border-radius',
    '--dv-floating-group-border',
    '--dv-floating-box-shadow',
    '--dv-floating-border',
    '--dv-floating-group-dragging-opacity',
    '--dv-drag-over-border',
] as (keyof ThemeCssOverrides)[];
const COLOR_SET = new Set<string>(COLOR_TOKENS);

/**
 * Seed for a custom theme that reproduces the current theme's look from the
 * base tokens: its surface, text and accent colours plus its shape.
 */
const seedFromTheme = (
    root: HTMLElement,
    settings: ResolvedDockviewThemeSettings,
    scheme: 'light' | 'dark'
): { css: ThemeCssOverrides; parts: Partial<ThemeParts> } => {
    const style = getComputedStyle(root);
    const read = (name: string) => style.getPropertyValue(name).trim();
    const color = (...names: string[]) => {
        for (const name of names) {
            const value = read(name);
            if (value) {
                const hex = normaliseColor(root, value);
                if (hex !== 'transparent') return hex;
            }
        }
        return undefined;
    };
    const css: ThemeCssOverrides = {
        'color-scheme': scheme,
        '--dv-background-color': color('--dv-group-view-background-color'),
        '--dv-foreground-color': color('--dv-activegroup-visiblepanel-tab-color'),
        '--dv-accent-color': color(
            '--dv-active-sash-color',
            '--dv-focus-ring-color',
            '--dv-paneview-active-outline-color'
        ),
        '--dv-tabs-and-actions-container-background-color': color(
            '--dv-tabs-and-actions-container-background-color'
        ),
    };
    const radius = Number.parseFloat(read('--dv-border-radius'));
    if (radius > 0) css['--dv-border-radius'] = `${radius}px`;
    const height = read('--dv-tabs-and-actions-container-height');
    if (height) css['--dv-tabs-and-actions-container-height'] = height;
    const cards = settings.gap > 0;
    if (cards) {
        css['--dv-spacing-padding'] = `${settings.gap}px`;
    }
    return { css, parts: { cards } };
};

export const Sidebar = (props: {
    open: boolean;
    onClose: () => void;
    // Theme builder props
    state: ThemeBuilderState;
    onChange: (patch: Partial<ThemeBuilderState>) => void;
    onCssChange: (patch: Partial<ThemeCssOverrides>) => void;
    onReset: () => void;
    /** Switch to the custom theme, seeded with these values. */
    onDeriveCustomTheme?: (
        css: ThemeCssOverrides,
        parts: Partial<ThemeParts>
    ) => void;
    baseTheme: DockviewTheme;
    effectiveTheme: DockviewTheme;
    containerEl: HTMLElement | null;
    // Controls props
    api?: DockviewApi;
    panels: string[];
    groups: string[];
    activePanel?: string;
    activeGroup?: string;
    hasCustomWatermark: boolean;
    toggleCustomWatermark: () => void;
    hasCustomGhost: boolean;
    toggleCustomGhost: () => void;
    dndCompass: boolean;
    onToggleDndCompass: () => void;
    smartGuides: boolean;
    onToggleSmartGuides: () => void;
    proportionalLayout: boolean;
    onToggleProportionalLayout: () => void;
    debug: boolean;
    onToggleDebug: () => void;
    showLogs: boolean;
    onToggleShowLogs: () => void;
    onClearLogs: () => void;
}) => {
    const [activeTab, setActiveTab] = React.useState<SidebarTab>('theme');
    const [effective, setEffective] = React.useState<Record<string, string>>(
        {}
    );
    const [showExport, setShowExport] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const css = props.state.cssOverrides;
    const custom = isBaseTheme(props.baseTheme);
    const settings = React.useMemo(
        () => resolveSettings(props.baseTheme, props.state),
        [props.baseTheme, props.state]
    );

    // Re-read after every change: derived values follow the base tokens, so
    // editing one row changes what others show.
    const revision = JSON.stringify([props.effectiveTheme, css]);
    React.useEffect(() => {
        if (!props.open || !props.containerEl) return;
        const id = requestAnimationFrame(() => {
            const root = findThemeRoot(props.containerEl);
            if (root) {
                setEffective(
                    readEffectiveValues(
                        root,
                        [...COLOR_TOKENS, ...OTHER_TOKENS],
                        COLOR_SET
                    )
                );
            }
        });
        return () => cancelAnimationFrame(id);
    }, [props.open, props.containerEl, revision]);

    if (!props.open) return null;

    const set = (patch: Partial<ThemeCssOverrides>) => props.onCssChange(patch);
    const setSetting = (patch: ThemeBuilderState['settings']) =>
        props.onChange({ settings: { ...props.state.settings, ...patch } });
    const setPart = (patch: Partial<ThemeParts>) =>
        props.onChange({ parts: { ...props.state.parts, ...patch } });

    const px = (name: keyof ThemeCssOverrides, fallback: number): number => {
        const value = Number.parseFloat(css[name] ?? effective[name] ?? '');
        return Number.isFinite(value) ? value : fallback;
    };

    const code = generateCodeSnippet(props.baseTheme, props.state);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleDerive = () => {
        const root = findThemeRoot(props.containerEl);
        if (!root || !props.onDeriveCustomTheme) return;
        const seed = seedFromTheme(
            root,
            settings,
            props.effectiveTheme.colorScheme ?? 'dark'
        );
        props.onDeriveCustomTheme(seed.css, seed.parts);
    };

    const colorRow = (label: string, name: keyof ThemeCssOverrides) => (
        <ColorRow
            key={name}
            label={label}
            value={css[name] ?? ''}
            effective={effective[name] ?? ''}
            onChange={(v) =>
                set({ [name]: v || undefined } as Partial<ThemeCssOverrides>)
            }
        />
    );

    const textRow = (label: string, name: keyof ThemeCssOverrides) => (
        <TextRow
            key={name}
            label={label}
            value={css[name] ?? ''}
            effective={effective[name] ?? ''}
            onChange={(v) =>
                set({ [name]: v || undefined } as Partial<ThemeCssOverrides>)
            }
        />
    );

    const pxSlider = (
        label: string,
        name: keyof ThemeCssOverrides,
        min: number,
        max: number,
        fallback = 0
    ) => (
        <SliderRow
            key={name}
            label={label}
            value={px(name, fallback)}
            min={min}
            max={max}
            unit="px"
            onChange={(v) =>
                set({ [name]: `${v}px` } as Partial<ThemeCssOverrides>)
            }
        />
    );

    const themeTab = (
        <>
            {/* Base tokens */}
            <Section title="Base" icon="tune" defaultOpen>
                {custom ? (
                    <Hint>
                        Everything else derives from these. Open the sections
                        below to override individual values.
                    </Hint>
                ) : (
                    <>
                        <Hint>
                            This theme sets its colours itself, so base colours
                            have no effect on it. Derive a custom theme from its
                            surface, text and accent colours to edit it from
                            here.
                        </Hint>
                        {props.onDeriveCustomTheme && (
                            <Btn
                                onClick={handleDerive}
                                icon="auto_fix_high"
                                style={{ marginBottom: 6, width: '100%' }}
                            >
                                Derive from base colours
                            </Btn>
                        )}
                    </>
                )}
                {custom && (
                    <ToggleRow
                        label="Scheme"
                        value={css['color-scheme'] ?? 'dark'}
                        options={[
                            { value: 'dark', label: 'dark' },
                            { value: 'light', label: 'light' },
                        ]}
                        onChange={(v) =>
                            set({ 'color-scheme': v as 'light' | 'dark' })
                        }
                    />
                )}
                {custom && colorRow('Background', '--dv-background-color')}
                {custom && colorRow('Foreground', '--dv-foreground-color')}
                {custom && colorRow('Accent', '--dv-accent-color')}
                {pxSlider('Spacing', '--dv-spacing', 1, 8, 4)}
                {pxSlider('Border radius', '--dv-border-radius', 0, 20)}
            </Section>

            {/* Layout */}
            <Section title="Layout" icon="space_dashboard" defaultOpen>
                <ToggleRow
                    label="Groups"
                    value={props.state.parts.cards ? 'cards' : 'flat'}
                    options={[
                        { value: 'flat', label: 'flat' },
                        { value: 'cards', label: 'cards' },
                    ]}
                    onChange={(v) => setPart({ cards: v === 'cards' })}
                />
                <ToggleRow
                    label="Tabs"
                    value={props.state.parts.connectedTabs ? 'connected' : 'plain'}
                    options={[
                        { value: 'plain', label: 'plain' },
                        { value: 'connected', label: 'connected' },
                    ]}
                    onChange={(v) =>
                        setPart({ connectedTabs: v === 'connected' })
                    }
                />
                {props.state.parts.cards &&
                    pxSlider('Card spacing', '--dv-spacing-padding', 0, 30, 10)}
                <SliderRow
                    label="Group gap"
                    value={settings.gap}
                    min={0}
                    max={30}
                    unit="px"
                    onChange={(v) => setSetting({ gap: v })}
                />
                {pxSlider(
                    'Tab bar height',
                    '--dv-tabs-and-actions-container-height',
                    20,
                    60,
                    35
                )}
                {pxSlider(
                    'Font size',
                    '--dv-tabs-and-actions-container-font-size',
                    10,
                    18,
                    13
                )}
                {pxSlider('Tab radius', '--dv-tab-border-radius', 0, 20)}
                {pxSlider('Sash radius', '--dv-sash-border-radius', 0, 20)}
            </Section>

            {/* Behaviour */}
            <Section title="Behaviour" icon="tab">
                <ToggleRow
                    label="Tab animation"
                    value={settings.tabAnimation}
                    options={[
                        { value: 'default', label: 'default' },
                        { value: 'smooth', label: 'smooth' },
                    ]}
                    onChange={(v) =>
                        setSetting({ tabAnimation: v as 'smooth' | 'default' })
                    }
                />
                <ToggleRow
                    label="Group indicator"
                    value={settings.tabGroupIndicator}
                    options={[
                        { value: 'wrap', label: 'wrap' },
                        { value: 'none', label: 'none' },
                    ]}
                    onChange={(v) =>
                        setSetting({ tabGroupIndicator: v as 'wrap' | 'none' })
                    }
                />
                <ToggleRow
                    label="Drop overlay"
                    value={settings.dndOverlayMounting}
                    options={[
                        { value: 'relative', label: 'relative' },
                        { value: 'absolute', label: 'absolute' },
                    ]}
                    onChange={(v) =>
                        setSetting({
                            dndOverlayMounting: v as 'relative' | 'absolute',
                        })
                    }
                />
                <ToggleRow
                    label="Drop target"
                    value={settings.dndPanelOverlay}
                    options={[
                        { value: 'content', label: 'content' },
                        { value: 'group', label: 'group' },
                    ]}
                    onChange={(v) =>
                        setSetting({ dndPanelOverlay: v as 'content' | 'group' })
                    }
                />
                <ToggleRow
                    label="Tab drop"
                    value={settings.dndTabIndicator}
                    options={[
                        { value: 'fill', label: 'fill' },
                        { value: 'line', label: 'line' },
                    ]}
                    onChange={(v) =>
                        setSetting({ dndTabIndicator: v as 'fill' | 'line' })
                    }
                />
                <TextRow
                    label="Drop border"
                    value={props.state.dndOverlayBorder}
                    effective={
                        effective['--dv-drag-over-border' as keyof ThemeCssOverrides] ??
                        ''
                    }
                    onChange={(v) => props.onChange({ dndOverlayBorder: v })}
                />
                {colorRow('Drop fill', '--dv-drag-over-background-color')}
            </Section>

            {/* Colours */}
            <Section title="Surfaces" icon="format_color_fill">
                {colorRow('Group background', '--dv-group-view-background-color')}
                {colorRow(
                    'Tab bar',
                    '--dv-tabs-and-actions-container-background-color'
                )}
                {colorRow('Separator', '--dv-separator-border')}
                {colorRow('Pane header border', '--dv-paneview-header-border-color')}
            </Section>

            <Section title="Tabs: focused group" icon="palette">
                {colorRow(
                    'Selected tab',
                    '--dv-activegroup-visiblepanel-tab-background-color'
                )}
                {colorRow('Selected text', '--dv-activegroup-visiblepanel-tab-color')}
                {colorRow(
                    'Other tabs',
                    '--dv-activegroup-hiddenpanel-tab-background-color'
                )}
                {colorRow('Other text', '--dv-activegroup-hiddenpanel-tab-color')}
            </Section>

            <Section title="Tabs: other groups" icon="palette">
                {colorRow(
                    'Selected tab',
                    '--dv-inactivegroup-visiblepanel-tab-background-color'
                )}
                {colorRow(
                    'Selected text',
                    '--dv-inactivegroup-visiblepanel-tab-color'
                )}
                {colorRow(
                    'Other tabs',
                    '--dv-inactivegroup-hiddenpanel-tab-background-color'
                )}
                {colorRow('Other text', '--dv-inactivegroup-hiddenpanel-tab-color')}
            </Section>

            <Section title="Details" icon="contrast">
                {colorRow('Tab divider', '--dv-tab-divider-color')}
                {colorRow('Icon hover', '--dv-icon-hover-background-color')}
                {colorRow('Sash', '--dv-sash-color')}
                {colorRow('Sash (active)', '--dv-active-sash-color')}
                {colorRow('Scrollbar', '--dv-tabs-container-scrollbar-color')}
            </Section>

            <Section title="Floating groups" icon="flip_to_front">
                <Slider
                    label="Dragging opacity"
                    value={(() => {
                        const v = Number.parseFloat(
                            css['--dv-floating-group-dragging-opacity'] ??
                                effective['--dv-floating-group-dragging-opacity'] ??
                                ''
                        );
                        return Number.isFinite(v) ? v : 0.5;
                    })()}
                    min={0}
                    max={1}
                    step={0.05}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) =>
                        set({ '--dv-floating-group-dragging-opacity': String(v) })
                    }
                />
                {textRow('Group border', '--dv-floating-group-border')}
                {textRow('Frame border', '--dv-floating-border')}
                {textRow('Shadow', '--dv-floating-box-shadow')}
            </Section>

            {/* Export */}
            <Section title="Export" icon="code">
                <div style={{ padding: '4px 0' }}>
                    <Btn
                        onClick={() => setShowExport((v) => !v)}
                        icon={
                            showExport
                                ? 'visibility_off'
                                : 'visibility'
                        }
                        style={{
                            marginBottom: showExport ? 8 : 0,
                        }}
                    >
                        {showExport ? 'Hide' : 'Show'} code
                    </Btn>
                    {showExport && (
                        <div>
                            <pre
                                className="dv-trade-scroll"
                                style={{
                                    background: SB.inputBg,
                                    border: `1px solid ${SB.border}`,
                                    borderRadius: SB.radiusSm,
                                    padding: '8px 10px',
                                    fontSize: 10.5,
                                    color: SB.muted,
                                    overflow: 'auto',
                                    fontFamily: SB.mono,
                                    whiteSpace: 'pre',
                                    margin: 0,
                                    maxHeight: 240,
                                }}
                            >
                                {code}
                            </pre>
                            <Btn
                                onClick={handleCopy}
                                primary={copied}
                                icon={
                                    copied ? 'check' : 'content_copy'
                                }
                                style={{
                                    marginTop: 6,
                                    width: '100%',
                                }}
                            >
                                {copied
                                    ? 'Copied!'
                                    : 'Copy to clipboard'}
                            </Btn>
                        </div>
                    )}
                </div>
            </Section>
        </>
    );

    return (
        <div
            className="dv-sb-panel"
            style={{
                width: '332px',
                background: SB.bg,
                color: SB.text,
                borderLeft: `1px solid ${SB.border}`,
                boxShadow: SB.shadowLg,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                fontFamily: SB.ui,
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '11px 12px 11px 14px',
                    borderBottom: `1px solid ${SB.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexShrink: 0,
                }}
            >
                <IconChip icon="tune" />
                <span
                    style={{
                        marginRight: 'auto',
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '-0.01em',
                        color: SB.heading,
                    }}
                >
                    Controls &amp; Theme
                </span>
                {activeTab === 'theme' && (
                    <Btn
                        onClick={props.onReset}
                        icon="restart_alt"
                        title="Reset all overrides"
                    >
                        Reset
                    </Btn>
                )}
                <IconBtn onClick={props.onClose} icon="close" title="Close" />
            </div>

            {/* Tab Toggle */}
            <TabToggle active={activeTab} onChange={setActiveTab} />

            {/* Scrollable content */}
            <div
                className="dv-trade-scroll"
                style={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                {activeTab === 'theme' ? (
                    themeTab
                ) : (
                    <ControlsContent
                        api={props.api}
                        panels={props.panels}
                        groups={props.groups}
                        activePanel={props.activePanel}
                        activeGroup={props.activeGroup}
                        hasCustomWatermark={props.hasCustomWatermark}
                        toggleCustomWatermark={props.toggleCustomWatermark}
                        hasCustomGhost={props.hasCustomGhost}
                        toggleCustomGhost={props.toggleCustomGhost}
                        dndCompass={props.dndCompass}
                        onToggleDndCompass={props.onToggleDndCompass}
                        smartGuides={props.smartGuides}
                        onToggleSmartGuides={props.onToggleSmartGuides}
                        proportionalLayout={props.proportionalLayout}
                        onToggleProportionalLayout={
                            props.onToggleProportionalLayout
                        }
                        debug={props.debug}
                        onToggleDebug={props.onToggleDebug}
                        showLogs={props.showLogs}
                        onToggleShowLogs={props.onToggleShowLogs}
                        onClearLogs={props.onClearLogs}
                    />
                )}
            </div>
        </div>
    );
};
