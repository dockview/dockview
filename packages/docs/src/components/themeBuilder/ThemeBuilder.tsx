import React from 'react';
import { DockviewTheme } from 'dockview-react';
import {
    BuilderState,
    SettingOverrides,
    THEMES,
    colorsDerive,
    decodeState,
    effectiveTheme,
    effectiveValue,
    encodeState,
    exportCss,
    exportTs,
    initialState,
    isBase,
    isHexColor,
    seedColors,
} from './model';
import {
    BASE_COLORS,
    ESSENTIAL_LENGTHS,
    TOKENS,
    TOKEN_GROUPS,
    TokenDef,
} from './tokens';
import { InspectTarget, Preview } from './Preview';
import styles from './themeBuilder.module.css';

// ── Small controls ───────────────────────────────────────────────────────────

const Segmented = <T extends string>(props: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    label: string;
}) => (
    <div className={styles.row}>
        <span className={styles.rowLabel}>{props.label}</span>
        <div className={styles.segmented} role="radiogroup" aria-label={props.label}>
            {props.options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={props.value === o.value}
                    className={props.value === o.value ? styles.segOn : ''}
                    onClick={() => props.onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    </div>
);

const ColorInput = (props: {
    value: string;
    effective: string;
    onChange: (v: string) => void;
    label: string;
}) => {
    const shown = props.value || props.effective;
    return (
        <span className={styles.colorInput}>
            <input
                type="color"
                aria-label={`${props.label} colour`}
                value={isHexColor(shown) ? shown : '#000000'}
                onChange={(e) => props.onChange(e.target.value)}
            />
            <input
                type="text"
                aria-label={`${props.label} value`}
                className={styles.textInput}
                value={props.value}
                placeholder={props.effective || 'auto'}
                onChange={(e) => props.onChange(e.target.value)}
                spellCheck={false}
            />
        </span>
    );
};

const Slider = (props: {
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (v: number) => void;
    label: string;
}) => (
    <span className={styles.slider}>
        <input
            type="range"
            aria-label={props.label}
            min={props.min}
            max={props.max}
            step={props.step ?? 1}
            value={props.value}
            onChange={(e) => props.onChange(Number(e.target.value))}
        />
        <span className={styles.sliderValue}>
            {props.step && props.step < 1
                ? props.value.toFixed(2)
                : Math.round(props.value)}
            {props.unit ?? ''}
        </span>
    </span>
);

const Section = (props: {
    title: string;
    open?: boolean;
    onToggle?: (open: boolean) => void;
    children: React.ReactNode;
    id?: string;
}) => (
    <details
        className={styles.section}
        open={props.open}
        id={props.id}
        onToggle={(e) =>
            props.onToggle?.((e.currentTarget as HTMLDetailsElement).open)
        }
    >
        <summary>{props.title}</summary>
        <div className={styles.sectionBody}>{props.children}</div>
    </details>
);

const px = (value: string | undefined, fallback: number) => {
    const n = Number.parseFloat(value ?? '');
    return Number.isFinite(n) ? n : fallback;
};

// ── Theme swatches for the gallery ───────────────────────────────────────────

type Swatch = { bg: string; strip: string; text: string; accent: string };

function useSwatches(): Record<string, Swatch> {
    const [swatches, setSwatches] = React.useState<Record<string, Swatch>>({});
    React.useEffect(() => {
        const out: Record<string, Swatch> = {};
        for (const { theme } of THEMES) {
            const el = document.createElement('div');
            el.className = theme.className;
            el.style.display = 'none';
            document.body.appendChild(el);
            const read = (name: string) =>
                effectiveValue(el, name, 'color') || 'transparent';
            out[theme.name] = {
                bg: read('--dv-group-view-background-color'),
                strip: read('--dv-tabs-and-actions-container-background-color'),
                text: read('--dv-activegroup-visiblepanel-tab-color'),
                accent: read('--dv-active-sash-color'),
            };
            el.remove();
        }
        setSwatches(out);
    }, []);
    return swatches;
}

// ── The builder ──────────────────────────────────────────────────────────────

type ExportTab = 'css' | 'ts';

const SHARE_KEY = 's';

function readSharedState(): BuilderState | undefined {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const value = hash.get(SHARE_KEY);
    return value ? decodeState(value) : undefined;
}

// The settings with a control, and the CSS property a theme sets them with.
type SettingKey = 'tabAnimation' | 'dndPanelOverlay' | 'dndTabIndicator';

const SETTING_PROPERTIES: Record<SettingKey, string> = {
    tabAnimation: '--dv-tab-animation',
    dndPanelOverlay: '--dv-dnd-panel-overlay',
    dndTabIndicator: '--dv-dnd-tab-indicator',
};

export const ThemeBuilder = (props: { initialTheme?: string }) => {
    const [state, setState] = React.useState<BuilderState>(
        () => readSharedState() ?? initialState(props.initialTheme)
    );
    const [history, setHistory] = React.useState<BuilderState[]>([]);
    const lastCoalesce = React.useRef<{ key: string; at: number } | null>(
        null
    );
    const [effective, setEffective] = React.useState<Record<string, string>>(
        {}
    );
    const [inspecting, setInspecting] = React.useState(false);
    const [highlight, setHighlight] = React.useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [exportTab, setExportTab] = React.useState<ExportTab>('css');
    const [copied, setCopied] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);
    const rootRef = React.useRef<HTMLElement | null>(null);
    const builderRef = React.useRef<HTMLDivElement>(null);

    // Fill the window below whatever sits above the builder (navbar, the
    // dismissible announcement bar), so the workspace never scrolls the page.
    React.useLayoutEffect(() => {
        const el = builderRef.current;
        if (!el) return;
        const fit = () => {
            if (window.matchMedia('(max-width: 900px)').matches) {
                el.style.height = '';
                return;
            }
            const top = el.getBoundingClientRect().top + window.scrollY;
            el.style.height = `${Math.max(480, window.innerHeight - top)}px`;
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(document.body);
        window.addEventListener('resize', fit);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', fit);
        };
    }, []);
    const swatches = useSwatches();

    const theme: DockviewTheme = React.useMemo(
        () => effectiveTheme(state),
        [state]
    );

    /**
     * Apply a change. Continuous edits to the same control within a short
     * window share one undo step; everything else gets its own.
     */
    const stateRef = React.useRef(state);
    stateRef.current = state;
    const commit = React.useCallback(
        (next: BuilderState, coalesceKey?: string) => {
            const now = Date.now();
            const last = lastCoalesce.current;
            const coalesce =
                coalesceKey !== undefined &&
                last?.key === coalesceKey &&
                now - last.at < 1000;
            lastCoalesce.current = coalesceKey
                ? { key: coalesceKey, at: now }
                : null;
            if (!coalesce) {
                const prev = stateRef.current;
                setHistory((h) => [...h.slice(-49), prev]);
                // A notice describes the step its Undo reverts; a new step
                // makes it stale. Callers set their own notice after this.
                setNotice(null);
            }
            stateRef.current = next;
            setState(next);
        },
        []
    );

    const undo = () => {
        setHistory((h) => {
            if (h.length === 0) return h;
            setState(h[h.length - 1]);
            lastCoalesce.current = null;
            return h.slice(0, -1);
        });
        setNotice(null);
    };

    const shareUrl = (s: BuilderState) => {
        const hash = new URLSearchParams();
        hash.set(SHARE_KEY, encodeState(s));
        return `${window.location.pathname}${window.location.search}#${hash}`;
    };

    // Keep the URL shareable.
    React.useEffect(() => {
        const id = window.setTimeout(() => {
            window.history.replaceState(null, '', shareUrl(state));
        }, 300);
        return () => window.clearTimeout(id);
    }, [state]);

    const onRendered = React.useCallback((root: HTMLElement) => {
        rootRef.current = root;
        const values: Record<string, string> = {};
        for (const name of BASE_COLORS) {
            values[name] = effectiveValue(root, name, 'color');
        }
        for (const l of ESSENTIAL_LENGTHS) {
            values[l.name] = effectiveValue(root, l.name, 'length');
        }
        for (const t of TOKENS) {
            values[t.name] = effectiveValue(root, t.name, t.kind);
        }
        values['--dv-group-gap'] = effectiveValue(root, '--dv-group-gap', 'length');
        // The theme's own behaviour settings (they don't inherit: read the root).
        const style = getComputedStyle(root);
        for (const key of Object.keys(SETTING_PROPERTIES)) {
            const property = SETTING_PROPERTIES[key as SettingKey];
            values[property] = style.getPropertyValue(property).trim();
        }
        // What deriving would start from, shown while the theme keeps its own
        // colours.
        for (const [name, value] of Object.entries(seedColors(root))) {
            values[`seed:${name}`] = value;
        }
        setEffective((prev) =>
            JSON.stringify(prev) === JSON.stringify(values) ? prev : values
        );
    }, []);

    const setVar = (name: string, value: string | undefined) => {
        const vars = { ...state.vars };
        if (value === undefined || value === '') delete vars[name];
        else vars[name] = value;
        return vars;
    };

    const setToken = (name: string, value: string | undefined) =>
        commit({ ...state, vars: setVar(name, value) }, name);

    /** Edit a base colour; on a built-in theme this turns on derived colours. */
    const setBaseColor = (name: string, value: string) => {
        if (colorsDerive(state)) {
            setToken(name, value);
            return;
        }
        const seed = rootRef.current ? seedColors(rootRef.current) : {};
        // Same undo step as the edits that follow on this control.
        commit(
            {
                ...state,
                derived: true,
                vars: { ...state.vars, ...seed, [name]: value },
            },
            name
        );
        setNotice(
            `${labelOf(state.base)} now derives its colours from Background, Foreground and Accent.`
        );
    };

    const setDerived = (derived: boolean) => {
        if (derived === state.derived) return;
        if (derived) {
            const seed = rootRef.current ? seedColors(rootRef.current) : {};
            commit({ ...state, derived, vars: { ...state.vars, ...seed } });
        } else {
            const vars = { ...state.vars };
            for (const name of BASE_COLORS) delete vars[name];
            commit({ ...state, derived, vars });
        }
    };

    const setSetting = <K extends keyof SettingOverrides>(
        key: K,
        value: SettingOverrides[K]
    ) => commit({ ...state, settings: { ...state.settings, [key]: value } }, key);

    /** A setting's value: the override, else the theme's CSS, else the default. */
    const settingOf = <K extends SettingKey>(
        key: K,
        fallback: NonNullable<SettingOverrides[K]>
    ) =>
        (state.settings[key] ??
            (effective[SETTING_PROPERTIES[key]] ||
                fallback)) as NonNullable<SettingOverrides[K]>;

    /** Choosing what the theme already does removes the override. */
    const chooseSetting = <K extends SettingKey>(
        key: K,
        value: SettingOverrides[K],
        fallback: string
    ) =>
        setSetting(
            key,
            value === (effective[SETTING_PROPERTIES[key]] || fallback)
                ? undefined
                : value
        );

    const startFrom = (name: string) => {
        if (name === state.base) return;
        commit(initialState(name));
        setNotice(`Started from ${labelOf(name)}. Undo restores your edits.`);
    };

    const reset = () => {
        commit(initialState(state.base));
        setNotice(null);
    };

    const copy = (text: string, what: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(what);
            window.setTimeout(() => setCopied(null), 1500);
        });
    };

    const onInspect = React.useCallback((target: InspectTarget) => {
        setAdvancedOpen(true);
        setQuery('');
        const id = target.token
            ? `tb-token-${target.token}`
            : `tb-group-${target.group}`;
        setHighlight(target.token ?? target.group ?? null);
        window.setTimeout(() => {
            document
                .getElementById(id)
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 50);
    }, []);

    React.useEffect(() => {
        if (!highlight) return;
        const id = window.setTimeout(() => setHighlight(null), 2200);
        return () => window.clearTimeout(id);
    }, [highlight]);

    const derives = colorsDerive(state);
    const statusOf = (t: TokenDef): 'set' | 'derived' | 'theme' => {
        if (state.vars[t.name]) return 'set';
        if (t.kind === 'color') return t.derived && derives ? 'derived' : 'theme';
        // Radii follow Border radius on every theme unless the theme sets them.
        if (t.scale !== undefined) {
            const expected = px(effective['--dv-border-radius'], 0) * t.scale;
            return Math.abs(px(effective[t.name], 0) - expected) < 0.5
                ? 'derived'
                : 'theme';
        }
        if (t.fallback && !effective[t.name]) return 'derived';
        return t.derived && isBase(state) ? 'derived' : 'theme';
    };

    const q = query.trim().toLowerCase();
    const matches = (t: TokenDef) =>
        !q ||
        t.label.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        t.name.includes(q) ||
        t.description.toLowerCase().includes(q);

    const tokenControl = (t: TokenDef) => {
        const value = state.vars[t.name] ?? '';
        const eff = effective[t.name] ?? '';
        switch (t.kind) {
            case 'color':
                return (
                    <ColorInput
                        label={t.label}
                        value={value}
                        effective={eff}
                        onChange={(v) => setToken(t.name, v)}
                    />
                );
            case 'length':
                return (
                    <Slider
                        label={t.label}
                        value={px(
                            value ||
                                eff ||
                                (t.fallback ? effective[t.fallback] : ''),
                            0
                        )}
                        min={t.min ?? 0}
                        max={t.max ?? 20}
                        unit="px"
                        onChange={(v) => setToken(t.name, `${v}px`)}
                    />
                );
            case 'number':
                return (
                    <Slider
                        label={t.label}
                        value={px(value || eff, 1)}
                        min={t.min ?? 0}
                        max={t.max ?? 1}
                        step={t.step}
                        onChange={(v) => setToken(t.name, String(v))}
                    />
                );
            default:
                return (
                    <input
                        type="text"
                        aria-label={t.label}
                        className={`${styles.textInput} ${styles.wide}`}
                        value={value}
                        placeholder={eff || 'auto'}
                        onChange={(e) => setToken(t.name, e.target.value)}
                        spellCheck={false}
                    />
                );
        }
    };

    const code = exportTab === 'css' ? exportCss(state) : exportTs(state);

    return (
        <div className={styles.builder} ref={builderRef}>
            <aside className={styles.panel} aria-label="Theme controls">
                <div className={styles.toolbar}>
                    <h1 className={styles.title}>Theme builder</h1>
                    <a
                        className={styles.button}
                        href="/docs/core/themeReference"
                        title="Every theme property, on the theme object and as CSS variables"
                    >
                        Reference
                    </a>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={undo}
                        disabled={history.length === 0}
                        title="Undo"
                    >
                        Undo
                    </button>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={reset}
                        title="Clear every change to this theme"
                    >
                        Reset
                    </button>
                </div>

                {notice && (
                    <div className={styles.notice} role="status">
                        <span>{notice}</span>
                        <button type="button" onClick={undo}>
                            Undo
                        </button>
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => setNotice(null)}
                        >
                            ×
                        </button>
                    </div>
                )}

                <div className={styles.scroll}>
                    <Section title="Essentials" open>
                        {!isBase(state) && (
                            <Segmented
                                label="Colours"
                                value={state.derived ? 'derived' : 'theme'}
                                options={[
                                    { value: 'theme', label: "Theme's own" },
                                    { value: 'derived', label: 'Derived' },
                                ]}
                                onChange={(v) => setDerived(v === 'derived')}
                            />
                        )}
                        {isBase(state) && (
                            <Segmented
                                label="Scheme"
                                value={
                                    state.vars['color-scheme'] === 'light'
                                        ? 'light'
                                        : 'dark'
                                }
                                options={[
                                    { value: 'dark', label: 'Dark' },
                                    { value: 'light', label: 'Light' },
                                ]}
                                onChange={(v) =>
                                    commit({
                                        ...state,
                                        vars: setVar(
                                            'color-scheme',
                                            v === 'dark' ? undefined : v
                                        ),
                                    })
                                }
                            />
                        )}
                        {(
                            [
                                ['--dv-background-color', 'Background'],
                                ['--dv-foreground-color', 'Foreground'],
                                ['--dv-accent-color', 'Accent'],
                            ] as const
                        ).map(([name, label]) => (
                            <div className={styles.row} key={name}>
                                <span className={styles.rowLabel}>{label}</span>
                                <ColorInput
                                    label={label}
                                    value={derives ? (state.vars[name] ?? '') : ''}
                                    effective={
                                        derives
                                            ? (effective[name] ?? '')
                                            : (effective[`seed:${name}`] ?? '')
                                    }
                                    onChange={(v) => setBaseColor(name, v)}
                                />
                            </div>
                        ))}
                        <p className={styles.hint}>
                            {derives
                                ? 'The tab strip, tabs, lines and hover all derive from these three.'
                                : 'This theme sets its own colours. Editing one of these derives them from Background, Foreground and Accent instead, keeping its layout.'}
                        </p>
                        {ESSENTIAL_LENGTHS.map((l) => (
                            <div className={styles.row} key={l.name}>
                                <span className={styles.rowLabel}>{l.label}</span>
                                <Slider
                                    label={l.label}
                                    value={px(
                                        state.vars[l.name] ?? effective[l.name],
                                        l.fallback
                                    )}
                                    min={l.min}
                                    max={l.max}
                                    unit="px"
                                    onChange={(v) => setToken(l.name, `${v}px`)}
                                />
                            </div>
                        ))}
                        <Segmented
                            label="Groups"
                            value={state.cards ? 'cards' : 'flat'}
                            options={[
                                { value: 'flat', label: 'Flat' },
                                { value: 'cards', label: 'Cards' },
                            ]}
                            onChange={(v) =>
                                commit({ ...state, cards: v === 'cards' })
                            }
                        />
                        <Segmented
                            label="Tabs"
                            value={state.connectedTabs ? 'connected' : 'plain'}
                            options={[
                                { value: 'plain', label: 'Plain' },
                                { value: 'connected', label: 'Connected' },
                            ]}
                            onChange={(v) =>
                                commit({
                                    ...state,
                                    connectedTabs: v === 'connected',
                                })
                            }
                        />
                    </Section>

                    <Section title="Behaviour">
                        <div className={styles.row}>
                            <span className={styles.rowLabel}>Group gap</span>
                            <Slider
                                label="Group gap"
                                value={state.settings.gap ?? (px(
                                    effective['--dv-group-gap'],
                                    0
                                ))}
                                min={0}
                                max={24}
                                unit="px"
                                onChange={(v) => setSetting('gap', v)}
                            />
                        </div>
                        <Segmented
                            label="Tab animation"
                            value={settingOf('tabAnimation', 'default')}
                            options={[
                                { value: 'default', label: 'Default' },
                                { value: 'smooth', label: 'Smooth' },
                            ]}
                            onChange={(v) => chooseSetting('tabAnimation', v, 'default')}
                        />
                        <Segmented
                            label="Drop target"
                            value={settingOf('dndPanelOverlay', 'content')}
                            options={[
                                { value: 'content', label: 'Content' },
                                { value: 'group', label: 'Group' },
                            ]}
                            onChange={(v) => chooseSetting('dndPanelOverlay', v, 'content')}
                        />
                        <Segmented
                            label="Tab drop"
                            value={settingOf('dndTabIndicator', 'fill')}
                            options={[
                                { value: 'fill', label: 'Fill' },
                                { value: 'line', label: 'Line' },
                            ]}
                            onChange={(v) => chooseSetting('dndTabIndicator', v, 'fill')}
                        />
                    </Section>

                    <Section
                        title="Advanced"
                        open={advancedOpen}
                        onToggle={setAdvancedOpen}
                        id="tb-advanced"
                    >
                        <input
                            type="search"
                            className={`${styles.textInput} ${styles.search}`}
                            placeholder="Search tokens"
                            aria-label="Search tokens"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        {TOKEN_GROUPS.map((group) => {
                            const tokens = TOKENS.filter(
                                (t) => t.group === group && matches(t)
                            );
                            if (tokens.length === 0) return null;
                            return (
                                <div
                                    key={group}
                                    id={`tb-group-${group}`}
                                    className={`${styles.tokenGroup} ${highlight === group ? styles.flash : ''}`}
                                >
                                    <h3>{group}</h3>
                                    {tokens.map((t) => {
                                        const status = statusOf(t);
                                        return (
                                            <div
                                                key={t.name}
                                                id={`tb-token-${t.name}`}
                                                className={`${styles.token} ${highlight === t.name ? styles.flash : ''}`}
                                            >
                                                <div className={styles.tokenHead}>
                                                    <span className={styles.tokenLabel}>
                                                        {t.label}
                                                    </span>
                                                    <span
                                                        className={`${styles.badge} ${styles[`badge_${status}`]}`}
                                                    >
                                                        {status}
                                                    </span>
                                                    {status === 'set' && (
                                                        <button
                                                            type="button"
                                                            className={styles.reset}
                                                            onClick={() =>
                                                                setToken(t.name, undefined)
                                                            }
                                                            title="Back to the derived or theme value"
                                                        >
                                                            Reset
                                                        </button>
                                                    )}
                                                </div>
                                                {tokenControl(t)}
                                                <div className={styles.tokenDesc}>
                                                    <code>{t.name}</code>{' '}
                                                    {t.description}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </Section>
                </div>

                <div className={styles.export}>
                    <div className={styles.exportTabs} role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={exportTab === 'css'}
                            className={exportTab === 'css' ? styles.segOn : ''}
                            onClick={() => setExportTab('css')}
                        >
                            CSS
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={exportTab === 'ts'}
                            className={exportTab === 'ts' ? styles.segOn : ''}
                            onClick={() => setExportTab('ts')}
                        >
                            Theme object
                        </button>
                        <span className={styles.spacer} />
                        <button
                            type="button"
                            className={styles.button}
                            onClick={() => copy(code, 'code')}
                        >
                            {copied === 'code' ? 'Copied' : 'Copy'}
                        </button>
                        <button
                            type="button"
                            className={styles.button}
                            onClick={() =>
                                copy(
                                    `${window.location.origin}${shareUrl(state)}`,
                                    'link'
                                )
                            }
                        >
                            {copied === 'link' ? 'Copied' : 'Share link'}
                        </button>
                    </div>
                    <pre className={styles.code}>{code}</pre>
                </div>
            </aside>

            <main className={styles.stage}>
                <div className={styles.galleryBar} aria-label="Start from a theme">
                    <span className={styles.galleryLabel}>Start from</span>
    <div className={styles.gallery}>
                        {THEMES.map(({ theme: t, label }) => {
                            const s = swatches[t.name];
                            return (
                                <button
                                    key={t.name}
                                    type="button"
                                    className={`${styles.card} ${state.base === t.name ? styles.cardOn : ''}`}
                                    onClick={() => startFrom(t.name)}
                                    aria-pressed={state.base === t.name}
                                >
                                    <span
                                        className={styles.cardPreview}
                                        style={{ background: s?.bg }}
                                    >
                                        <span
                                            className={styles.cardStrip}
                                            style={{ background: s?.strip }}
                                        >
                                            <span
                                                className={styles.cardTab}
                                                style={{ background: s?.bg }}
                                            />
                                        </span>
                                        <span
                                            className={styles.cardText}
                                            style={{ background: s?.text }}
                                        />
                                        <span
                                            className={styles.cardAccent}
                                            style={{ background: s?.accent }}
                                        />
                                    </span>
                                    <span className={styles.cardLabel}>
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className={styles.stageBar}>
                    <span>
                        Live preview of{' '}
                        <strong>{labelOf(state.base)}</strong>
                        {state.derived && !isBase(state) ? ' (derived colours)' : ''}
                    </span>
                    <span className={styles.spacer} />
                    <button
                        type="button"
                        className={`${styles.button} ${inspecting ? styles.buttonOn : ''}`}
                        aria-pressed={inspecting}
                        onClick={() => setInspecting((v) => !v)}
                        title="Click a part of the preview to find its setting"
                    >
                        {inspecting ? 'Click a part to edit it' : 'Inspect'}
                    </button>
                </div>
                <Preview
                    theme={theme}
                    vars={state.vars}
                    inspecting={inspecting}
                    onInspect={onInspect}
                    onRendered={onRendered}
                />
            </main>
        </div>
    );
};

function labelOf(name: string): string {
    return THEMES.find((t) => t.theme.name === name)?.label ?? name;
}
