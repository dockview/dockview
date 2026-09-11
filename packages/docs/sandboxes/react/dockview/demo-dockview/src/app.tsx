import {
    DockviewDefaultTab,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewGroupDragGhostProps,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
    DockviewApi,
    DockviewTheme,
    themeAbyss,
    IContextMenuItemComponentProps,
    GetTabContextMenuItemsParams,
    GetTabGroupChipContextMenuItemsParams,
    DEFAULT_TAB_GROUP_COLORS,
} from 'dockview-react';
// Registers the `dockview-enterprise` modules (pinned tabs, smart guides, drop
// guide, auto-hide, context menu, tab-group chips, …) and the license check into
// the global registry (a side effect of importing the package).
import { LicenseManager } from 'dockview-enterprise';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import './app.scss';
import {
    defaultConfig,
    populateEdgeGroups,
    setupEdgeGroups,
} from './defaultLayout';
import { LeftControls, PrefixHeaderControls, RightControls } from './controls';
import { Table, usePanelApiMetadata } from './debugPanel';
import { OrdersPanel } from './ordersPanel';
import { OrderBookPanel } from './orderBookPanel';
import { EventLogPanel } from './eventLogPanel';
import { LayoutInspectorPanel } from './layoutInspectorPanel';
import { PanelDebugPanel } from './panelDebugPanel';
import { MarketProvider } from './marketContext';
import { WatchlistPanel } from './watchlistPanel';
import { PriceAlertPanel } from './priceAlertPanel';
import { PositionSummaryPanel } from './positionSummaryPanel';
import { ChartPanel } from './chartPanel';
import { NewsPanel } from './newsPanel';
import { FxTilesPanel } from './fxTilesPanel';
import { SignalsPanel } from './signalsPanel';
import { CorrelationPanel } from './correlationPanel';
import { VolSurfacePanel } from './volSurfacePanel';
import { MONO, VisibilityGate } from './panelKit';
import {
    PanelColorsContext,
    DARK_COLORS,
    LIGHT_COLORS,
    usePanelColors,
} from './panelTheme';
import {
    ThemeBuilderState,
    ThemeCssOverrides,
    buildEffectiveTheme,
    getInitialStateFromTheme,
} from './themeBuilder';
import { Sidebar } from './themeBuilderModal';

// Set the docs license key here (not only in index.tsx): the docs /demo page
// loads this module (app.tsx) directly via ExampleFrame, never index.tsx, so
// otherwise every dockview instance, including the nested FX Rates dockview,
// renders the "Unlicensed" watermark. Runs at module load, before any dockview
// is created; harmless if index.tsx also sets it (standalone/CodeSandbox).
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

export const ApiContext = React.createContext<DockviewApi | undefined>(
    undefined
);

const DebugContext = React.createContext<boolean>(false);

const Option = (props: {
    title: string;
    onClick: () => void;
    value: string;
}) => {
    return (
        <div>
            <span>{`${props.title}: `}</span>
            <button onClick={props.onClick}>{props.value}</button>
        </div>
    );
};

const ShadowIframe = (props: IDockviewPanelProps) => {
    return (
        <iframe
            onMouseDown={() => {
                if (!props.api.isActive) {
                    props.api.setActive();
                }
            }}
            style={{ border: 'none', width: '100%', height: '100%' }}
            src="https://dockview.dev"
        />
    );
};

const components = {
    default: (props: IDockviewPanelProps) => {
        const isDebug = React.useContext(DebugContext);
        const metadata = usePanelApiMetadata(props.api);
        const c = usePanelColors();

        if (isDebug) {
            return (
                <div
                    style={{
                        height: '100%',
                        overflow: 'auto',
                        background: c.bg,
                        color: c.text,
                        border: '2px dashed orange',
                        padding: 8,
                        fontSize: '0.8em',
                    }}
                >
                    <Option
                        title="Panel Rendering Mode"
                        value={metadata.renderer.value}
                        onClick={() =>
                            props.api.setRenderer(
                                props.api.renderer === 'always'
                                    ? 'onlyWhenVisible'
                                    : 'always'
                            )
                        }
                    />
                    <Table data={metadata} />
                </div>
            );
        }

        // Clean, theme-aware placeholder for generic / user-added panels: a
        // faint dotted field with the panel title and an idle status line.
        return (
            <div
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: c.bg,
                    color: c.text,
                    border: `1px solid ${c.border}`,
                    backgroundImage: `radial-gradient(${c.border} 1px, transparent 1px)`,
                    backgroundSize: '16px 16px',
                }}
            >
                <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 26, color: c.textFaint }}
                >
                    monitoring
                </span>
                <div
                    style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 600,
                        color: c.textSecondary,
                    }}
                >
                    {props.api.title}
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 10.5,
                        color: c.textFaint,
                    }}
                >
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: 6,
                            background: c.green,
                            boxShadow: `0 0 4px ${c.green}`,
                        }}
                    />
                    Connected · idle
                </div>
            </div>
        );
    },
    nested: (props: IDockviewPanelProps) => {
        const theme = React.useContext(ThemeContext);
        return (
            <DockviewReact
                components={components}
                onReady={(event: DockviewReadyEvent) => {
                    event.api.addPanel({ id: 'panel_1', component: 'default' });
                    event.api.addPanel({ id: 'panel_2', component: 'default' });
                    event.api.addPanel({
                        id: 'panel_3',
                        component: 'default',
                    });

                    event.api.onDidRemovePanel((e) => {
                        console.log('remove', e);
                    });
                }}
                theme={theme}
            />
        );
    },
    fixedPlaceholder: (props: IDockviewPanelProps) => {
        const c = usePanelColors();
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    height: '100%',
                    color: c.textMuted,
                    fontFamily: MONO,
                    fontSize: props.params?.position === 'top' ? '13px' : '14px',
                }}
            >
                <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, color: c.textFaint }}
                >
                    folder_open
                </span>
                <span>{props.params?.label as string}</span>
            </div>
        );
    },
    iframe: (props: IDockviewPanelProps) => {
        return (
            <iframe
                onMouseDown={() => {
                    if (!props.api.isActive) {
                        props.api.setActive();
                    }
                }}
                style={{
                    border: 'none',
                    width: '100%',
                    height: '100%',
                }}
                src="https://dockview.dev"
            />
        );
    },
    vesselfinder: (props: IDockviewPanelProps) => {
        const srcdoc = `<!DOCTYPE html>
<html><head><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;}</style></head>
<body>
<script>var width="100%";var height="100%";var latitude="51.5";var longitude="-0.12";var zoom="8";var names=false;</script>
<script src="https://www.vesselfinder.com/aismap.js"></script>
</body></html>`;
        return (
            <iframe
                onMouseDown={() => {
                    if (!props.api.isActive) {
                        props.api.setActive();
                    }
                }}
                srcDoc={srcdoc}
                style={{
                    border: 'none',
                    width: '100%',
                    height: '100%',
                }}
            />
        );
    },
    debuginfo: (props: IDockviewPanelProps) => <PanelDebugPanel {...props} />,
    // Live-ticking panels are wrapped so they only re-render while visible
    // (renderer:'always' keeps inactive tabs mounted). The blotter and news are
    // static so they don't need gating.
    orders: () => <OrdersPanel />,
    orderbook: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <OrderBookPanel />
        </VisibilityGate>
    ),
    watchlist: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <WatchlistPanel />
        </VisibilityGate>
    ),
    pricealert: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <PriceAlertPanel />
        </VisibilityGate>
    ),
    positionsummary: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <PositionSummaryPanel />
        </VisibilityGate>
    ),
    chart: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <ChartPanel />
        </VisibilityGate>
    ),
    news: () => <NewsPanel />,
    fxtiles: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <FxTilesPanel />
        </VisibilityGate>
    ),
    signals: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <SignalsPanel />
        </VisibilityGate>
    ),
    correlation: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <CorrelationPanel />
        </VisibilityGate>
    ),
    volsurface: (props: IDockviewPanelProps) => (
        <VisibilityGate api={props.api}>
            <VolSurfacePanel />
        </VisibilityGate>
    ),
    eventlog: () => {
        const api = React.useContext(ApiContext);
        if (!api) return null;
        return <EventLogPanel api={api} />;
    },
    layoutinspector: () => {
        const api = React.useContext(ApiContext);
        if (!api) return null;
        return <LayoutInspectorPanel api={api} />;
    },
    shadowDom: (props: IDockviewPanelProps) => {
        const ref = React.useRef<HTMLDivElement>(null);

        React.useEffect(() => {
            if (!ref.current) {
                return;
            }

            const shadow = ref.current.attachShadow({
                mode: 'open',
            });

            const shadowRoot = document.createElement('div');
            shadowRoot.style.height = '100%';
            shadow.appendChild(shadowRoot);

            const root = ReactDOM.createRoot(shadowRoot);

            root.render(<ShadowIframe {...props} />);

            return () => {
                root.unmount();
            };
        }, []);

        return <div style={{ height: '100%' }} ref={ref}></div>;
    },
};

const headerComponents = {
    default: (props: IDockviewPanelHeaderProps) => {
        return <DockviewDefaultTab {...props} />;
    },
};

const FloatMenuItem = ({
    panel,
    api,
    close,
}: IContextMenuItemComponentProps) => {
    return (
        <div
            className="dv-context-menu-item"
            onClick={() => {
                api.addFloatingGroup(panel);
                close();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
            <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px' }}
            >
                ad_group
            </span>
            Float tab
        </div>
    );
};

const PopoutMenuItem = ({
    panel,
    api,
    close,
}: IContextMenuItemComponentProps) => {
    return (
        <div
            className="dv-context-menu-item"
            onClick={() => {
                api.addPopoutGroup(panel);
                close();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
            <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px' }}
            >
                open_in_new
            </span>
            Popout tab
        </div>
    );
};

type TabOverflowMode = 'dropdown' | 'wrap';

interface TabModeMenuItemProps {
    mode: TabOverflowMode;
    active: boolean;
    onSelect: (mode: TabOverflowMode) => void;
}

const TAB_MODE_LABELS: Record<TabOverflowMode, string> = {
    dropdown: 'Overflow dropdown',
    wrap: 'Wrap onto rows',
};

/**
 * Radio-style item for `overflow.mode`. `updateOptions` re-applies wrap to every
 * group, so the two modes can be swapped while the dock is live; the tick marks
 * whichever is currently active.
 */
const TabModeMenuItem = ({
    close,
    componentProps,
}: IContextMenuItemComponentProps) => {
    const { mode, active, onSelect } = componentProps as TabModeMenuItemProps;

    return (
        <div
            className="dv-context-menu-item"
            onClick={() => {
                onSelect(mode);
                close();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
        >
            {TAB_MODE_LABELS[mode]}
            {/* Kept mounted (not conditionally rendered) so the reserved space
                stops the menu width changing as the tick moves between modes. */}
            <span
                className="material-symbols-outlined"
                style={{
                    fontSize: '14px',
                    marginLeft: 'auto',
                    visibility: active ? 'visible' : 'hidden',
                }}
            >
                check
            </span>
        </div>
    );
};

/**
 * Checkable toggle for an edge group's auto-hide mode. `setAutoHide` writes a
 * per-group override of the global `autoHideEdgeGroups` option and the auto-hide
 * controller reconciles the group's chrome live, so a single edge can be flipped
 * between a pinnable tool window and a static docked panel while the dock runs.
 *
 * One toggling item rather than an on/off pair: every edge group here starts
 * auto-hiding, so in a pair the ticked row is the one you'd reach for first and
 * clicking it would do nothing.
 */
const EdgeAutoHideMenuItem = ({
    group,
    close,
}: IContextMenuItemComponentProps) => {
    const autoHide = group.api.isAutoHide();

    return (
        <div
            className="dv-context-menu-item"
            onClick={() => {
                group.api.setAutoHide(!autoHide);
                if (autoHide) {
                    // Turning it off: nothing expands a collapsed edge group
                    // once auto-hide is gone (the strip's click-to-peek goes
                    // with it and the sash is locked at the collapsed size), so
                    // open it here rather than leave a dead strip.
                    group.api.expand();
                }
                close();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
        >
            Auto-hide edge
            {/* Kept mounted (not conditionally rendered) so the reserved space
                stops the menu width changing as the tick comes and goes. */}
            <span
                className="material-symbols-outlined"
                style={{
                    fontSize: '14px',
                    marginLeft: 'auto',
                    visibility: autoHide ? 'visible' : 'hidden',
                }}
            >
                check
            </span>
        </div>
    );
};

const colors = [
    'rgba(255,0,0,0.2)',
    'rgba(0,255,0,0.2)',
    'rgba(0,0,255,0.2)',
    'rgba(255,255,0,0.2)',
    'rgba(0,255,255,0.2)',
    'rgba(255,0,255,0.2)',
];
let count = 0;

const WatermarkComponent = () => {
    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: 'rgba(255,255,255,0.55)',
                fontFamily: 'monospace',
                pointerEvents: 'none',
            }}
        >
            <span
                className="material-symbols-outlined"
                style={{ fontSize: 32, opacity: 0.7 }}
            >
                dashboard
            </span>
            <div style={{ fontSize: 13 }}>Custom watermark</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
                Drag a tab here or add a panel
            </div>
        </div>
    );
};

const GroupDragGhost = (props: IDockviewGroupDragGhostProps) => {
    const count = props.group.panels.length;
    const title = props.group.activePanel?.title ?? 'Group';
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(33, 150, 243, 0.92)',
                color: 'white',
                font: '11px/1 system-ui, sans-serif',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            }}
        >
            <span style={{ fontWeight: 600 }}>{title}</span>
            <span
                style={{
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.25)',
                }}
            >
                +{Math.max(0, count - 1)} more
            </span>
        </div>
    );
};

export const ThemeContext = React.createContext<DockviewTheme | undefined>(
    undefined
);

const DockviewDemo = (props: {
    theme?: DockviewTheme;
    showSidebar?: boolean;
    onCloseSidebar?: () => void;
    onChangeTheme?: (theme: DockviewTheme) => void;
    onReady?: () => void;
}) => {
    const [logLines, setLogLines] = React.useState<
        { text: string; timestamp?: Date; backgroundColor?: string }[]
    >([]);

    const [panels, setPanels] = React.useState<string[]>([]);
    const [groups, setGroups] = React.useState<string[]>([]);
    const [api, setApi] = React.useState<DockviewApi>();
    const [layoutReady, setLayoutReady] = React.useState(false);

    const [activePanel, setActivePanel] = React.useState<string>();
    const [activeGroup, setActiveGroup] = React.useState<string>();

    const [pending, setPending] = React.useState<
        { text: string; timestamp?: Date }[]
    >([]);

    const addLogLine = (message: string) => {
        setPending((line) => [
            { text: message, timestamp: new Date() },
            ...line,
        ]);
    };

    React.useLayoutEffect(() => {
        if (pending.length === 0) {
            return;
        }
        const color = colors[count++ % colors.length];
        setLogLines((lines) => [
            ...pending.map((_) => ({ ..._, backgroundColor: color })),
            ...lines,
        ]);
        setPending([]);
    }, [pending]);

    React.useEffect(() => {
        if (!api) {
            return;
        }

        // Reset tracked state for the new api instance to prevent stale IDs
        // accumulating across remounts (e.g. when toggling shell mode).
        setPanels([]);
        setGroups([]);
        setActivePanel(undefined);
        setActiveGroup(undefined);

        const disposables = [
            api.onDidAddPanel((event) => {
                setPanels((_) => [..._, event.id]);
                addLogLine(`Panel Added ${event.id}`);
            }),
            api.onDidActivePanelChange((event) => {
                setActivePanel(event.panel?.id);
                addLogLine(`Panel Activated ${event.panel?.id}`);
            }),
            api.onDidRemovePanel((event) => {
                setPanels((_) => {
                    const next = [..._];
                    next.splice(
                        next.findIndex((x) => x === event.id),
                        1
                    );

                    return next;
                });
                addLogLine(`Panel Removed ${event.id}`);
            }),

            api.onDidAddGroup((event) => {
                setGroups((_) => [..._, event.id]);
                addLogLine(`Group Added ${event.id}`);
            }),

            api.onDidMovePanel((event) => {
                addLogLine(`Panel Moved ${event.panel.id}`);
            }),

            api.onDidMaximizedGroupChange((event) => {
                addLogLine(
                    `Group Maximized Changed ${event.group.api.id} [${event.isMaximized}]`
                );
            }),

            api.onDidRemoveGroup((event) => {
                setGroups((_) => {
                    const next = [..._];
                    next.splice(
                        next.findIndex((x) => x === event.id),
                        1
                    );

                    return next;
                });
                addLogLine(`Group Removed ${event.id}`);
            }),

            api.onDidActiveGroupChange((event) => {
                setActiveGroup(event?.id);
                addLogLine(`Group Activated ${event?.id}`);
            }),
        ];

        const loadLayout = () => {
            const state = localStorage.getItem('dv-demo-state-v9');

            if (state) {
                try {
                    api.fromJSON(JSON.parse(state));
                    populateEdgeGroups(api);
                    setLayoutReady(true);
                    return;
                } catch {
                    localStorage.removeItem('dv-demo-state-v9');
                }
                return;
            }

            // The default layout is a serialized snapshot (fromJSON) that
            // already includes the edge groups, so no populateEdgeGroups here.
            defaultConfig(api);

            setLayoutReady(true);
        };

        loadLayout();

        return () => {
            disposables.forEach((disposable) => disposable.dispose());
        };
    }, [api]);

    const onReady = (event: DockviewReadyEvent) => {
        setupEdgeGroups(event.api);
        setApi(event.api);
    };

    // Signal the host once the layout is loaded and the dock becomes visible,
    // so a loading overlay can fade out at the right moment rather than while
    // the grid is still hidden.
    const hasSignalledReady = React.useRef(false);
    React.useEffect(() => {
        if (layoutReady && !hasSignalledReady.current) {
            hasSignalledReady.current = true;
            props.onReady?.();
        }
    }, [layoutReady, props]);

    const [builderState, setBuilderState] = React.useState<ThemeBuilderState>(
        () => getInitialStateFromTheme(props.theme ?? themeAbyss)
    );

    const prevTheme = React.useRef(props.theme);
    React.useEffect(() => {
        if (prevTheme.current !== props.theme) {
            prevTheme.current = props.theme;
            setBuilderState(
                getInitialStateFromTheme(props.theme ?? themeAbyss)
            );
        }
    }, [props.theme]);

    const updateBuilder = (patch: Partial<ThemeBuilderState>) =>
        setBuilderState((s) => ({ ...s, ...patch }));

    const updateCss = (patch: Partial<ThemeCssOverrides>) =>
        setBuilderState((s) => {
            const next = { ...s.cssOverrides };
            for (const [k, v] of Object.entries(patch)) {
                if (v === undefined || v === '') {
                    delete (next as Record<string, unknown>)[k];
                } else {
                    (next as Record<string, unknown>)[k] = v;
                }
            }
            return { ...s, cssOverrides: next };
        });

    const effectiveTheme = React.useMemo(
        () => buildEffectiveTheme(props.theme ?? themeAbyss, builderState),
        [props.theme, builderState]
    );

    const containerRef = React.useRef<HTMLDivElement>(null);
    const prevCssOverrideKeys = React.useRef<string[]>([]);

    React.useEffect(() => {
        const dvRoot = containerRef.current?.querySelector(
            '[class*="dockview-theme"]'
        ) as HTMLElement | null;
        if (!dvRoot) return;

        for (const k of prevCssOverrideKeys.current) {
            if (!(k in builderState.cssOverrides)) {
                dvRoot.style.removeProperty(k);
            }
        }
        for (const [k, v] of Object.entries(builderState.cssOverrides)) {
            dvRoot.style.setProperty(k, v as string);
        }
        prevCssOverrideKeys.current = Object.keys(builderState.cssOverrides);
    }, [builderState.cssOverrides]);

    const panelColors = React.useMemo(
        () =>
            effectiveTheme.colorScheme === 'light' ? LIGHT_COLORS : DARK_COLORS,
        [effectiveTheme]
    );

    // Briefly enable colour transitions when the light/dark scheme flips, so the
    // dock crossfades between modes instead of hard-cutting. Scoped to the
    // switch moment (a temporary class) so it never interferes with dragging,
    // resizing or tab changes, and skipped under reduced-motion.
    const [themeAnimating, setThemeAnimating] = React.useState(false);
    const prevScheme = React.useRef(effectiveTheme.colorScheme);
    React.useEffect(() => {
        if (prevScheme.current === effectiveTheme.colorScheme) {
            return;
        }
        prevScheme.current = effectiveTheme.colorScheme;
        if (
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }
        setThemeAnimating(true);
        const handle = window.setTimeout(() => setThemeAnimating(false), 350);
        return () => window.clearTimeout(handle);
    }, [effectiveTheme.colorScheme]);

    const [tabOverflowMode, setTabOverflowMode] =
        React.useState<TabOverflowMode>('dropdown');

    // `'wrap'` needs the MultiRowTabsModule, which the `dockview-enterprise`
    // import above registers. Memoized so the prop only reaches `updateOptions`
    // when the mode actually changes.
    const overflow = React.useMemo(
        () => ({ mode: tabOverflowMode }),
        [tabOverflowMode]
    );

    const getTabContextMenuItems = React.useCallback(
        ({ panel, group }: GetTabContextMenuItemsParams) => {
            const items: (
                | 'close'
                | 'closeOthers'
                | 'closeAll'
                | 'closeLeft'
                | 'closeRight'
                | 'maximize'
                | 'separator'
                | 'pin'
                | {
                      component: React.FC<IContextMenuItemComponentProps>;
                      componentProps?: object;
                  }
                | { label: string; action: () => void }
            )[] = [
                // No 'pin' here: `pinnedTabs.enabled` makes the context menu
                // module inject Pin/Unpin at the top of the list already.
                'separator',
                'close',
                'closeOthers',
                'closeAll',
                'closeLeft',
                'closeRight',
                'separator',
                'maximize',
                'separator',
                // Switches `overflow.mode` between the single-row strip + chevron
                // dropdown and multi-row wrapping tabs.
                ...(['dropdown', 'wrap'] as TabOverflowMode[]).map((mode) => ({
                    component: TabModeMenuItem,
                    componentProps: {
                        mode,
                        active: tabOverflowMode === mode,
                        onSelect: setTabOverflowMode,
                    } satisfies TabModeMenuItemProps,
                })),
                'separator',
                ...(group.api.location.type === 'edge'
                    ? // An edge group can't float or pop out, but it can switch
                      // between a pinnable tool window and a static docked
                      // panel, so that toggle takes the slot instead.
                      [{ component: EdgeAutoHideMenuItem }]
                    : // Float / popout are shown here as custom component items
                      // (with icons); the `'float'` and `'popout'` built-in
                      // shortcuts do the same thing without custom rendering.
                      [
                          { component: FloatMenuItem },
                          { component: PopoutMenuItem },
                      ]),
            ];

            if (api) {
                const groupId = group.id;
                const panelId = panel.id;
                const tabGroup = api.getTabGroupForPanel({ groupId, panelId });
                const allTabGroups = api.getTabGroups({ groupId });
                const otherTabGroups = allTabGroups.filter(
                    (tg) => tg.id !== tabGroup?.id
                );

                items.push('separator');

                if (tabGroup) {
                    items.push({
                        label: `Remove from "${tabGroup.label || tabGroup.id}"`,
                        action: () =>
                            api.removePanelFromTabGroup({ groupId, panelId }),
                    });
                }

                for (const tg of otherTabGroups) {
                    items.push({
                        label: `Add to "${tg.label || tg.id}"`,
                        action: () =>
                            api.addPanelToTabGroup({
                                groupId,
                                tabGroupId: tg.id,
                                panelId,
                            }),
                    });
                }

                items.push({
                    label: 'Add to new group',
                    action: () => {
                        const label = window.prompt('Group name:') || '';
                        const colors = DEFAULT_TAB_GROUP_COLORS;
                        const color =
                            colors[Math.floor(Math.random() * colors.length)]
                                .id;
                        const newGroup = api.createTabGroup({
                            groupId,
                            label,
                            color,
                        });
                        api.addPanelToTabGroup({
                            groupId,
                            tabGroupId: newGroup.id,
                            panelId,
                        });
                    },
                });
            }

            return items;
        },
        [api, tabOverflowMode]
    );

    const getTabGroupChipContextMenuItems = React.useCallback(
        ({ group, tabGroup }: GetTabGroupChipContextMenuItemsParams) => {
            const items: (
                | 'colorPicker'
                | 'rename'
                | 'collapse'
                | 'close'
                | 'separator'
                | { label: string; action: () => void }
            )[] = ['rename', 'colorPicker', 'collapse', 'close'];

            if (api) {
                // Float / popout operate on the whole containing group, so they
                // stay custom items. The built-in chip shortcuts are scoped to
                // the tab group (`'collapse'` / `'close'`, used above).
                items.push(
                    'separator',
                    {
                        label: 'Float group',
                        action: () => api.addFloatingGroup(group),
                    },
                    {
                        label: 'Popout group',
                        action: () => {
                            void api.addPopoutGroup(group);
                        },
                    },
                    'separator',
                    {
                        label: 'Dissolve group',
                        action: () =>
                            api.dissolveTabGroup({
                                groupId: group.id,
                                tabGroupId: tabGroup.id,
                            }),
                    }
                );
            }

            return items;
        },
        [api]
    );

    const [watermark, setWatermark] = React.useState<boolean>(false);
    const [customGhost, setCustomGhost] = React.useState<boolean>(false);
    const [dndCompass, setDndCompass] = React.useState<boolean>(false);
    const [smartGuides, setSmartGuides] = React.useState<boolean>(true);
    // `false` hands a container resize to the last group in each row/column
    // instead of sharing it out proportionally, so every splitter but the last
    // stays put - the VS Code behaviour.
    const [proportionalLayout, setProportionalLayout] =
        React.useState<boolean>(true);

    const [gapCheck, setGapCheck] = React.useState<boolean>(false);

    const css = React.useMemo(() => {
        if (!gapCheck) {
            return {};
        }

        return {
            '--dv-group-gap-size': '0.5rem',
            '--demo-border': '5px dashed purple',
        } as React.CSSProperties;
    }, [gapCheck]);

    const [showLogs, setShowLogs] = React.useState<boolean>(false);
    const [debug, setDebug] = React.useState<boolean>(false);
    return (
        <div
            className={`dockview-demo${
                effectiveTheme.colorScheme === 'light'
                    ? ' dockview-demo--light'
                    : ''
            }${themeAnimating ? ' dv-theme-animating' : ''}`}
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                backgroundColor:
                    effectiveTheme.colorScheme === 'light'
                        ? 'rgba(0,0,0,0.03)'
                        : 'rgba(0,0,50,0.25)',
                borderRadius: '8px',
                position: 'relative',
                ...css,
            }}
        >
            <div
                style={{
                    flexGrow: 1,
                    height: 0,
                    display: 'flex',
                }}
            >
                <div
                    ref={containerRef}
                    style={{
                        flexGrow: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        visibility: layoutReady ? 'visible' : 'hidden',
                    }}
                >
                    <PanelColorsContext.Provider value={panelColors}>
                        <MarketProvider>
                            <ApiContext.Provider value={api}>
                                <DebugContext.Provider value={debug}>
                                    <ThemeContext.Provider
                                        value={effectiveTheme}
                                    >
                                        <DockviewReact
                                            components={components}
                                            defaultTabComponent={
                                                headerComponents.default
                                            }
                                            rightHeaderActionsComponent={
                                                RightControls
                                            }
                                            leftHeaderActionsComponent={
                                                LeftControls
                                            }
                                            prefixHeaderActionsComponent={
                                                PrefixHeaderControls
                                            }
                                            watermarkComponent={
                                                watermark
                                                    ? WatermarkComponent
                                                    : undefined
                                            }
                                            groupDragGhostComponent={
                                                customGhost
                                                    ? GroupDragGhost
                                                    : undefined
                                            }
                                            onReady={onReady}
                                            keyboardNavigation
                                            theme={effectiveTheme}
                                            autoHideEdgeGroups
                                            dockToEdgeGroups
                                            pinnedTabs={{ enabled: true }}
                                            overflow={overflow}
                                            floatingGroupDragHandle="titlebar"
                                            dndCompass={dndCompass}
                                            smartGuides={
                                                smartGuides
                                                    ? { snapDistance: 8 }
                                                    : undefined
                                            }
                                            proportionalLayout={
                                                proportionalLayout
                                            }
                                            getTabContextMenuItems={
                                                getTabContextMenuItems
                                            }
                                            getTabGroupChipContextMenuItems={
                                                getTabGroupChipContextMenuItems
                                            }
                                        />
                                    </ThemeContext.Provider>
                                </DebugContext.Provider>
                            </ApiContext.Provider>
                        </MarketProvider>
                    </PanelColorsContext.Provider>
                </div>

                {showLogs && (
                    <div
                        style={{
                            width: '400px',
                            backgroundColor:
                                effectiveTheme.colorScheme === 'light'
                                    ? '#f6f8fa'
                                    : 'black',
                            color:
                                effectiveTheme.colorScheme === 'light'
                                    ? '#1f2328'
                                    : 'white',
                            overflow: 'hidden',
                            fontFamily: 'monospace',
                            marginLeft: '10px',
                            flexShrink: 0,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div style={{ flexGrow: 1, overflow: 'auto' }}>
                            {logLines.map((line, i) => {
                                return (
                                    <div
                                        style={{
                                            height: '30px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: '13px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            backgroundColor:
                                                line.backgroundColor,
                                        }}
                                        key={i}
                                    >
                                        <span
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                minWidth: '20px',
                                                maxWidth: '20px',
                                                color: 'gray',
                                                borderRight: '1px solid gray',
                                                marginRight: '4px',
                                                paddingLeft: '4px',
                                                height: '100%',
                                            }}
                                        >
                                            {logLines.length - i}
                                        </span>
                                        <span>
                                            {line.timestamp && (
                                                <span
                                                    style={{
                                                        fontSize: '0.7em',
                                                        padding: '0px 2px',
                                                    }}
                                                >
                                                    {line.timestamp
                                                        .toISOString()
                                                        .substring(11, 23)}
                                                </span>
                                            )}
                                            <span>{line.text}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div
                            style={{
                                padding: '4px',
                                display: 'flex',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <button onClick={() => setLogLines([])}>
                                Clear
                            </button>
                        </div>
                    </div>
                )}
                <Sidebar
                    open={props.showSidebar ?? false}
                    onClose={props.onCloseSidebar ?? (() => {})}
                    state={builderState}
                    onChange={updateBuilder}
                    onCssChange={updateCss}
                    onReset={() =>
                        setBuilderState(
                            getInitialStateFromTheme(props.theme ?? themeAbyss)
                        )
                    }
                    baseTheme={props.theme ?? themeAbyss}
                    containerEl={containerRef.current}
                    api={api}
                    panels={panels}
                    groups={groups}
                    activePanel={activePanel}
                    activeGroup={activeGroup}
                    hasCustomWatermark={watermark}
                    toggleCustomWatermark={() => setWatermark(!watermark)}
                    hasCustomGhost={customGhost}
                    toggleCustomGhost={() => setCustomGhost(!customGhost)}
                    dndCompass={dndCompass}
                    onToggleDndCompass={() => setDndCompass(!dndCompass)}
                    smartGuides={smartGuides}
                    onToggleSmartGuides={() => setSmartGuides(!smartGuides)}
                    proportionalLayout={proportionalLayout}
                    onToggleProportionalLayout={() =>
                        setProportionalLayout(!proportionalLayout)
                    }
                    debug={debug}
                    onToggleDebug={() => setDebug(!debug)}
                    showLogs={showLogs}
                    onToggleShowLogs={() => setShowLogs(!showLogs)}
                    onClearLogs={() => setLogLines([])}
                />
            </div>
        </div>
    );
};

export default DockviewDemo;
