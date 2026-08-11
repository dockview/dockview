// Bridge that lets the marketing recorder (scripts/record/harness/movie.html)
// render the REAL /demo trading panels instead of bespoke mock widgets.
//
// It exposes the same `window.MovieWidgets.mount(el, kind, title)` surface the
// harness already calls, but each panel is the actual React component from the
// demo app. All panels render through React portals under ONE MarketProvider,
// so they share a single live market simulation (consistent prices across the
// order book, chart, watchlist, …) even though dockview mounts each into its
// own container.
//
// Built with esbuild to scripts/record/harness/panels.bundle.js
// (see packages/docs/package.json → build:harness-panels).

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { MarketProvider } from './marketContext';
import { PanelColorsContext, DARK_COLORS, LIGHT_COLORS } from './panelTheme';
import { ChartPanel } from './chartPanel';
import { OrderBookPanel } from './orderBookPanel';
import { WatchlistPanel } from './watchlistPanel';
import { PositionSummaryPanel } from './positionSummaryPanel';
import { SignalsPanel } from './signalsPanel';
import { CorrelationPanel } from './correlationPanel';
import { VolSurfacePanel } from './volSurfacePanel';
import { NewsPanel } from './newsPanel';
import { OrdersPanel } from './ordersPanel';
import { PriceAlertPanel } from './priceAlertPanel';

// Harness "kind" → real demo panel. Kinds are kept stable so the scenes /
// storyboards / beats need no knowledge of which component backs each one.
// (FxTilesPanel is intentionally excluded: it depends on the demo app shell.)
const REGISTRY: Record<string, React.FC> = {
    chart: ChartPanel,
    depth: OrderBookPanel,
    positions: PositionSummaryPanel,
    watch: WatchlistPanel,
    tape: OrdersPanel,
    heat: CorrelationPanel,
    terminal: NewsPanel,
    nodes: PriceAlertPanel,
    lines: SignalsPanel,
    bars: VolSurfacePanel,
    donut: PriceAlertPanel,
    news: NewsPanel,
    signals: SignalsPanel,
    vol: VolSurfacePanel,
    orders: OrdersPanel,
    correlation: CorrelationPanel,
};

type Item = { id: number; el: HTMLElement; kind: string };

// Tiny external store the host subscribes to (mount/unmount happen outside
// React, driven by dockview).
const store = {
    items: [] as Item[],
    mode: 'dark' as 'dark' | 'light',
    listeners: new Set<() => void>(),
    emit() {
        this.listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
        this.listeners.add(l);
        return () => this.listeners.delete(l);
    },
};

const Host: React.FC = () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => store.subscribe(force), []);
    const colors = store.mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
    return (
        <PanelColorsContext.Provider value={colors}>
            {store.items.map((it) => {
                const Comp = REGISTRY[it.kind] || NewsPanel;
                return createPortal(
                    <div style={{ height: '100%' }}>
                        <Comp />
                    </div>,
                    it.el,
                    String(it.id)
                );
            })}
        </PanelColorsContext.Provider>
    );
};

let booted = false;
function boot() {
    if (booted) return;
    booted = true;
    const hostEl = document.createElement('div');
    hostEl.style.display = 'none';
    document.body.appendChild(hostEl);
    createRoot(hostEl).render(
        <MarketProvider>
            <Host />
        </MarketProvider>
    );
}

let seq = 0;

(window as any).MovieWidgets = {
    mount(el: HTMLElement, kind: string, _title?: string) {
        boot();
        el.style.height = '100%';
        const id = ++seq;
        store.items = [...store.items, { id, el, kind }];
        store.emit();
        return {
            stop() {
                store.items = store.items.filter((i) => i.id !== id);
                store.emit();
            },
        };
    },
    // Flip the panel colour tokens when the reel morphs to / from a light theme.
    setColors(mode: 'dark' | 'light') {
        store.mode = mode;
        store.emit();
    },
};
