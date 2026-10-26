import { fireEvent } from '@testing-library/dom';
import {
    DockviewComponent,
    getPanelData,
    IContentRenderer,
} from 'dockview-core';
import {
    computePinnedFirstOrder,
    computePinnedRowDropIndex,
    PinnedTabsService,
} from '../pinnedTabsService';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    constructor() {
        this.element.className = 'dv-test-content';
    }
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

/**
 * Pinned tabs (Phase 1: model + ordering). Pinned tabs render before all
 * unpinned tabs in their group; pin order is stable (pin appends to the pinned
 * block, unpin returns to the start of the unpinned block). Owned by the
 * PinnedTabs module and dormant unless `pinnedTabs.enabled` is set.
 */
describe('pinned tabs: ordering math', () => {
    const isPinnedIn =
        (pinned: string[]) =>
        (id: string): boolean =>
            pinned.includes(id);

    test('pinning one tab moves it to the front', () => {
        expect(
            computePinnedFirstOrder(['a', 'b', 'c'], isPinnedIn(['c']), ['c'])
        ).toEqual(['c', 'a', 'b']);
    });

    test('pinned tabs follow pinnedOrder, not strip order', () => {
        expect(
            computePinnedFirstOrder(
                ['a', 'b', 'c', 'd'],
                isPinnedIn(['b', 'd']),
                ['d', 'b']
            )
        ).toEqual(['d', 'b', 'a', 'c']);
    });

    test('a pinned id missing from pinnedOrder sorts after known ones', () => {
        // `a` is pinned but not in pinnedOrder → ranks last among pinned.
        expect(
            computePinnedFirstOrder(['a', 'b', 'c'], isPinnedIn(['a', 'c']), [
                'c',
            ])
        ).toEqual(['c', 'a', 'b']);
    });

    test('no pinned tabs leaves order untouched', () => {
        expect(
            computePinnedFirstOrder(['a', 'b', 'c'], isPinnedIn([]), [])
        ).toEqual(['a', 'b', 'c']);
    });

    test('unpinned tabs keep their relative order behind the pinned block', () => {
        expect(
            computePinnedFirstOrder(['a', 'b', 'c', 'd'], isPinnedIn(['c']), [
                'c',
            ])
        ).toEqual(['c', 'a', 'b', 'd']);
    });
});

describe('pinned tabs: row reorder index math', () => {
    // Three tabs, 20px wide, laid out at x = [0, 20, 40] → midpoints [10, 30, 50].
    const midpoints = [10, 30, 50];

    test('dragging the first tab past the last lands it at the end', () => {
        // pointer past every midpoint → slot 3; from 0 → target 2.
        expect(computePinnedRowDropIndex(midpoints, 55, 0)).toBe(2);
    });

    test('dragging the last tab before the first lands it at the front', () => {
        // pointer before every midpoint → slot 0; from 2 → target 0.
        expect(computePinnedRowDropIndex(midpoints, 5, 2)).toBe(0);
    });

    test('dragging the first tab just past the second midpoint lands it second', () => {
        // pointer past midpoints [10, 30] → slot 2; from 0 → target 1.
        expect(computePinnedRowDropIndex(midpoints, 35, 0)).toBe(1);
    });

    test('a drop that does not cross a midpoint is a no-op (target === from)', () => {
        // Dragging the middle tab, pointer between tabs 0 and 1 → slot 1; from 1.
        expect(computePinnedRowDropIndex(midpoints, 15, 1)).toBe(1);
    });

    test('the result is clamped to the last valid index', () => {
        // A far-right pointer never exceeds count - 1.
        expect(computePinnedRowDropIndex(midpoints, 9999, 1)).toBe(2);
    });

    test('a single tab always maps to index 0', () => {
        expect(computePinnedRowDropIndex([10], 9999, 0)).toBe(0);
        expect(computePinnedRowDropIndex([10], -9999, 0)).toBe(0);
    });
});

describe('pinned tabs: integration', () => {
    let container: HTMLElement;

    const make = (
        pinnedTabs: DockviewComponent['options']['pinnedTabs']
    ): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            pinnedTabs,
        });
        dockview.layout(1000, 1000);
        return dockview;
    };

    afterEach(() => {
        container.remove();
    });

    const threePanels = (dockview: DockviewComponent) => {
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        const order = () => a.api.group.model.panels.map((p) => p.id);
        return { a, b, c, order };
    };

    const tabEl = (panel: { api: any }): HTMLElement => {
        const id = panel.api.group.model.header.getTabId(panel.id)!;
        return document.getElementById(id)!;
    };

    test('a pinned tab is labelled by default (marker + glyph, not compact)', () => {
        const dockview = make({ enabled: true });
        const { c } = threePanels(dockview);

        expect(tabEl(c).classList.contains('dv-tab--pinned')).toBe(false);
        expect(tabEl(c).querySelector('.dv-tab-pin')).toBeNull();

        c.api.setPinned(true);

        expect(tabEl(c).classList.contains('dv-tab--pinned')).toBe(true);
        // Default is labelled, not compact.
        expect(tabEl(c).classList.contains('dv-tab--pinned-compact')).toBe(
            false
        );
        // A pin glyph is injected.
        expect(tabEl(c).querySelector('.dv-tab-pin')).not.toBeNull();

        c.api.setPinned(false);
        expect(tabEl(c).classList.contains('dv-tab--pinned')).toBe(false);
        expect(tabEl(c).querySelector('.dv-tab-pin')).toBeNull();
    });

    test('a custom tab renderer is not disrupted when pinned', () => {
        // A component with a custom tab renderer (its own markup).
        const localContainer = document.createElement('div');
        document.body.appendChild(localContainer);
        const dockview = new DockviewComponent(localContainer, {
            createComponent: () => new TestPanel(),
            createTabComponent: () => ({
                element: (() => {
                    const e = document.createElement('div');
                    e.className = 'my-custom-tab';
                    return e;
                })(),
                init: () => undefined,
                dispose: () => undefined,
            }),
            pinnedTabs: { enabled: true, compact: true },
        });
        dockview.layout(1000, 1000);

        const p = dockview.addPanel({
            id: 'p',
            component: 'default',
            tabComponent: 'custom',
        });
        p.api.setPinned(true);

        const tab = document.getElementById(
            p.api.group.model.header.getTabId('p')!
        )!;
        // The pinned marker class is applied so the custom tab can style itself.
        expect(tab.classList.contains('dv-tab--pinned')).toBe(true);
        // But no glyph is injected and the custom markup is intact.
        expect(tab.querySelector('.dv-tab-pin')).toBeNull();
        expect(tab.querySelector('.my-custom-tab')).not.toBeNull();

        localContainer.remove();
    });

    test('compact: true renders the pinned tab icon-only', () => {
        const dockview = make({ enabled: true, compact: true });
        const { c } = threePanels(dockview);

        c.api.setPinned(true);

        expect(tabEl(c).classList.contains('dv-tab--pinned')).toBe(true);
        expect(tabEl(c).classList.contains('dv-tab--pinned-compact')).toBe(
            true
        );
        expect(tabEl(c).querySelector('.dv-tab-pin')).not.toBeNull();
    });

    test('the pinned class survives a reorder (which recreates the tab)', () => {
        const dockview = make({ enabled: true });
        const { a, c } = threePanels(dockview);

        c.api.setPinned(true);
        // Reorder unpinned tabs to force the strip (and tab elements) to rebuild.
        a.api.moveTo({ index: 2 });

        expect(tabEl(c).classList.contains('dv-tab--pinned')).toBe(true);
    });

    test('pinning reorders the tab so pinned tabs render first', () => {
        const dockview = make({ enabled: true });
        const { c, order } = threePanels(dockview);

        expect(order()).toEqual(['a', 'b', 'c']);

        c.api.setPinned(true);

        expect(c.api.isPinned).toBe(true);
        expect(order()).toEqual(['c', 'a', 'b']);
    });

    test('multiple pinned tabs keep pin order; unpin returns to the unpinned block', () => {
        const dockview = make({ enabled: true });
        const { b, c, order } = threePanels(dockview);

        c.api.setPinned(true);
        b.api.setPinned(true);
        // pinned in pin sequence [c, b], unpinned [a]
        expect(order()).toEqual(['c', 'b', 'a']);

        c.api.setPinned(false);
        // pinned [b]; c re-joins the unpinned block at its front
        expect(c.api.isPinned).toBe(false);
        expect(order()).toEqual(['b', 'c', 'a']);
    });

    test('fires onDidChangePinned (panel) and onDidPanelPinnedChange (component)', () => {
        const dockview = make({ enabled: true });
        const { c } = threePanels(dockview);

        const panelEvents: boolean[] = [];
        const componentEvents: { id: string; isPinned: boolean }[] = [];
        c.api.onDidChangePinned((e) => panelEvents.push(e.isPinned));
        dockview.api.onDidPanelPinnedChange((e) =>
            componentEvents.push({ id: e.panel.id, isPinned: e.isPinned })
        );

        c.api.setPinned(true);
        c.api.setPinned(false);

        expect(panelEvents).toEqual([true, false]);
        expect(componentEvents).toEqual([
            { id: 'c', isPinned: true },
            { id: 'c', isPinned: false },
        ]);
    });

    test('dormant unless enabled: setPinned is a no-op when pinnedTabs is unset', () => {
        const dockview = make(undefined);
        const { c, order } = threePanels(dockview);

        c.api.setPinned(true);

        expect(c.api.isPinned).toBe(false);
        expect(order()).toEqual(['a', 'b', 'c']);
    });

    test('dormant unless enabled: setPinned is a no-op when enabled is false', () => {
        const dockview = make({ enabled: false });
        const { c, order } = threePanels(dockview);

        c.api.setPinned(true);

        expect(c.api.isPinned).toBe(false);
        expect(order()).toEqual(['a', 'b', 'c']);
    });

    test('the active panel survives a pin reorder', () => {
        const dockview = make({ enabled: true });
        const { a, c, order } = threePanels(dockview);

        a.api.setActive();
        expect(a.api.isActive).toBe(true);

        c.api.setPinned(true);

        expect(order()).toEqual(['c', 'a', 'b']);
        expect(a.api.isActive).toBe(true);
    });

    // The overflow-exclusion predicate is a stable function installed onto each
    // group's header when the group is created. Capture it by spying on the
    // header prototype and creating a fresh group.
    const captureOverflowPredicate = (
        dockview: DockviewComponent,
        anchor: { api: any }
    ) => {
        const spy = jest.spyOn(
            Object.getPrototypeOf(anchor.api.group.model.header),
            'setOverflowExclude'
        );
        const fresh = dockview.addPanel({
            id: 'fresh',
            component: 'default',
            position: { direction: 'right' },
        });
        const predicate = spy.mock.calls[spy.mock.calls.length - 1][0] as (
            id: string
        ) => boolean;
        spy.mockRestore();
        return { predicate, freshGroup: fresh.api.group };
    };

    test('pinning feeds the tab strip an overflow-exclusion predicate', () => {
        const dockview = make({ enabled: true });
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        const { predicate } = captureOverflowPredicate(dockview, a);

        c.api.setPinned(true);
        // The pinned tab is excluded from overflow; unpinned tabs are not.
        expect(predicate('c')).toBe(true);
        expect(predicate('a')).toBe(false);

        c.api.setPinned(false);
        expect(predicate('c')).toBe(false);
    });

    test('closing a pinned panel prunes it from the overflow-exclusion set', () => {
        const dockview = make({ enabled: true });
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        const { predicate } = captureOverflowPredicate(dockview, a);

        c.api.setPinned(true);
        expect(predicate('c')).toBe(true);

        // A close is not an unpin; the id must still be pruned so it can't
        // linger in the exclusion set and mis-exclude a future reused id.
        c.api.close();
        expect(predicate('c')).toBe(false);
    });

    test('each group is wired with a clamping drop-index resolver', () => {
        const dockview = make({
            enabled: true,
            togglePinOnCrossBoundaryDrag: false,
        });
        const first = dockview.addPanel({ id: 'first', component: 'default' });
        // Spy on the header prototype before the next group is created so its
        // wiring call is captured.
        const proto = Object.getPrototypeOf(first.api.group.model.header);
        const spy = jest.spyOn(proto, 'setDropIndexResolver');

        const x = dockview.addPanel({
            id: 'x',
            component: 'default',
            position: { direction: 'right' },
        });
        dockview.addPanel({ id: 'y', component: 'default' }); // joins x's group

        expect(spy).toHaveBeenCalled();
        const resolve = spy.mock.calls[spy.mock.calls.length - 1][0] as (
            panelId: string,
            index: number
        ) => number;

        x.api.setPinned(true); // group [x(pinned), y]; boundary for dragging y = 1
        // An unpinned tab cannot land left of the pin boundary.
        expect(resolve('y', 0)).toBe(1);
        // A pinned tab cannot land in the unpinned zone.
        expect(resolve('x', 5)).toBe(0);

        spy.mockRestore();
    });

    // Spy on `setPinnedSticky` on the header prototype before the next group is
    // created so its group-add wiring call is captured.
    const captureStickyCalls = (
        dockview: DockviewComponent,
        anchor: { api: any }
    ): boolean[] => {
        const spy = jest.spyOn(
            Object.getPrototypeOf(anchor.api.group.model.header),
            'setPinnedSticky'
        );
        dockview.addPanel({
            id: 'fresh',
            component: 'default',
            position: { direction: 'right' },
        });
        const calls = spy.mock.calls.map((c) => c[0] as boolean);
        spy.mockRestore();
        return calls;
    };

    test('inline mode wires each group for sticky-on-scroll pinned tabs', () => {
        const dockview = make({ enabled: true });
        const anchor = dockview.addPanel({ id: 'a', component: 'default' });
        expect(captureStickyCalls(dockview, anchor)).toEqual([true]);
    });

    test('stickyScroll: false opts a group out of sticky wiring', () => {
        const dockview = make({ enabled: true, stickyScroll: false });
        const anchor = dockview.addPanel({ id: 'a', component: 'default' });
        expect(captureStickyCalls(dockview, anchor)).toEqual([]);
    });

    test('separate-row mode does not use sticky (the row is always visible)', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const anchor = dockview.addPanel({ id: 'a', component: 'default' });
        expect(captureStickyCalls(dockview, anchor)).toEqual([]);
    });
});

describe('pinned tabs: reorder guard', () => {
    const makeService = (pinnedTabs: unknown): PinnedTabsService => {
        const stub: any = () => ({ dispose() {} });
        return new PinnedTabsService({
            options: { pinnedTabs },
            onDidPanelPinnedChange: stub,
            onDidAddGroup: stub,
            onDidRemoveGroup: stub,
            onDidOptionsChange: stub,
            onDidLayoutFromJSON: stub,
            onDidRemovePanel: stub,
        } as any);
    };

    const grp = (
        panels: { id: string; pinned: boolean; setPinned?: jest.Mock }[]
    ): any => ({
        model: {
            panels: panels.map((p) => ({
                id: p.id,
                api: {
                    isPinned: p.pinned,
                    setPinned: p.setPinned ?? jest.fn(),
                },
            })),
        },
    });

    describe('clamp (togglePinOnCrossBoundaryDrag: false)', () => {
        const svc = makeService({
            enabled: true,
            togglePinOnCrossBoundaryDrag: false,
        });
        const g = grp([
            { id: 'p', pinned: true },
            { id: 'a', pinned: false },
            { id: 'b', pinned: false },
        ]);

        test('an unpinned tab is clamped to the pin boundary', () => {
            expect(svc.resolveDropIndex(g, 'a', 0)).toBe(1);
        });

        test('an unpinned tab inside the unpinned zone is left alone', () => {
            expect(svc.resolveDropIndex(g, 'a', 2)).toBe(2);
        });

        test('a pinned tab is clamped back into the pinned block', () => {
            expect(svc.resolveDropIndex(g, 'p', 2)).toBe(0);
        });

        test('a pinned tab inside the pinned block is left alone', () => {
            expect(svc.resolveDropIndex(g, 'p', 0)).toBe(0);
        });

        test('the boundary excludes the dragged panel (two pinned)', () => {
            const g2 = grp([
                { id: 'p1', pinned: true },
                { id: 'p2', pinned: true },
                { id: 'a', pinned: false },
            ]);
            expect(svc.resolveDropIndex(g2, 'a', 1)).toBe(2);
            expect(svc.resolveDropIndex(g2, 'p1', 2)).toBe(1);
        });

        test('a panel not in the group passes through', () => {
            expect(svc.resolveDropIndex(g, 'missing', 0)).toBe(0);
        });
    });

    test('disabled feature passes the index through unchanged', () => {
        const svc = makeService({ enabled: false });
        const g = grp([
            { id: 'p', pinned: true },
            { id: 'a', pinned: false },
        ]);
        expect(svc.resolveDropIndex(g, 'a', 0)).toBe(0);
    });

    test('the default (no togglePinOnCrossBoundaryDrag) clamps, not flips', async () => {
        const svc = makeService({ enabled: true });
        const setPinned = jest.fn();
        const g = grp([
            { id: 'p', pinned: true },
            { id: 'a', pinned: false, setPinned },
        ]);

        // Cross-boundary drop is clamped to the boundary, and nothing flips.
        expect(svc.resolveDropIndex(g, 'a', 0)).toBe(1);
        await Promise.resolve();
        expect(setPinned).not.toHaveBeenCalled();
    });

    describe('flip (togglePinOnCrossBoundaryDrag: true)', () => {
        test('dragging an unpinned tab into the pinned zone pins it', async () => {
            const svc = makeService({
                enabled: true,
                togglePinOnCrossBoundaryDrag: true,
            });
            const setPinned = jest.fn();
            const g = grp([
                { id: 'p', pinned: true },
                { id: 'a', pinned: false, setPinned },
            ]);

            expect(svc.resolveDropIndex(g, 'a', 0)).toBe(0);
            expect(setPinned).not.toHaveBeenCalled(); // deferred

            await Promise.resolve();
            expect(setPinned).toHaveBeenCalledWith(true);
        });

        test('dragging a pinned tab into the unpinned zone unpins it', async () => {
            const svc = makeService({
                enabled: true,
                togglePinOnCrossBoundaryDrag: true,
            });
            const setPinned = jest.fn();
            const g = grp([
                { id: 'p', pinned: true, setPinned },
                { id: 'a', pinned: false },
            ]);

            // boundary excluding p = 0; index 1 crosses into the unpinned zone
            expect(svc.resolveDropIndex(g, 'p', 1)).toBe(1);

            await Promise.resolve();
            expect(setPinned).toHaveBeenCalledWith(false);
        });
    });

    // A drag that originated in the pinned second row always flips (unpins) a
    // drop past the boundary: the row is the only handle on the tab, so a
    // drag-out is a deliberate unpin regardless of the clamp/flip option.
    describe('row-originated drag (unpin-by-drag-out)', () => {
        test('a drag out of the row unpins even in clamp mode', async () => {
            const svc = makeService({
                enabled: true,
                togglePinOnCrossBoundaryDrag: false,
            });
            const setPinned = jest.fn();
            const g = grp([
                { id: 'p', pinned: true, setPinned },
                { id: 'a', pinned: false },
            ]);

            svc.beginRowDrag('p');
            // Not clamped back to the boundary: the drop index is honoured…
            expect(svc.resolveDropIndex(g, 'p', 1)).toBe(1);
            await Promise.resolve();
            // …and the panel unpins.
            expect(setPinned).toHaveBeenCalledWith(false);
        });

        test('the forced flip ends with the drag (clamp restored)', () => {
            const svc = makeService({
                enabled: true,
                togglePinOnCrossBoundaryDrag: false,
            });
            const setPinned = jest.fn();
            const g = grp([
                { id: 'p', pinned: true, setPinned },
                { id: 'a', pinned: false },
            ]);

            svc.beginRowDrag('p');
            svc.endRowDrag();
            // Back to clamp: a pinned tab is pinned-clamped to the boundary.
            expect(svc.resolveDropIndex(g, 'p', 1)).toBe(0);
            expect(setPinned).not.toHaveBeenCalled();
        });

        test('the forced flip is scoped to the row-dragged panel only', () => {
            const svc = makeService({
                enabled: true,
                togglePinOnCrossBoundaryDrag: false,
            });
            const g = grp([
                { id: 'p1', pinned: true },
                { id: 'p2', pinned: true },
                { id: 'a', pinned: false },
            ]);

            svc.beginRowDrag('p1');
            // p2 is not the row-dragged panel → still clamped to its boundary.
            expect(svc.resolveDropIndex(g, 'p2', 2)).toBe(1);
        });
    });
});

describe('pinned tabs: serialization', () => {
    const containers: HTMLElement[] = [];

    const make = (
        pinnedTabs: DockviewComponent['options']['pinnedTabs']
    ): DockviewComponent => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        containers.push(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            pinnedTabs,
        });
        dockview.layout(1000, 1000);
        return dockview;
    };

    afterEach(() => {
        while (containers.length) {
            containers.pop()!.remove();
        }
    });

    const buildPinned = (dockview: DockviewComponent): void => {
        dockview.addPanel({ id: 'a', component: 'default' });
        dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        c.api.setPinned(true); // order becomes [c, a, b]
    };

    test('toJSON emits pinned only for pinned panels', () => {
        const dockview = make({ enabled: true });
        buildPinned(dockview);

        const json = dockview.api.toJSON();

        expect(json.panels['c'].pinned).toBe(true);
        expect(json.panels['a'].pinned).toBeUndefined();
        expect(json.panels['b'].pinned).toBeUndefined();
    });

    test('a round-trip preserves pinned state and pinned-first order', () => {
        const source = make({ enabled: true });
        buildPinned(source);
        const json = source.api.toJSON();

        const target = make({ enabled: true });
        target.api.fromJSON(json);

        const c = target.api.getPanel('c')!;
        expect(c.api.isPinned).toBe(true);
        expect(target.api.getPanel('a')!.api.isPinned).toBe(false);
        expect(c.api.group.model.panels.map((p) => p.id)).toEqual([
            'c',
            'a',
            'b',
        ]);
    });

    test('a pinned layout loads unpinned when pinning is disabled', () => {
        const source = make({ enabled: true });
        buildPinned(source);
        const json = source.api.toJSON();
        expect(json.panels['c'].pinned).toBe(true);

        // Restore into a component with pinning disabled → the `pinned` key is
        // ignored, so the tab is not left pinned-but-unmanageable.
        const target = make({ enabled: false });
        target.api.fromJSON(json);

        expect(target.api.getPanel('c')!.api.isPinned).toBe(false);
    });

    test('a layout without a pinned key loads unpinned (back-compat)', () => {
        const source = make({ enabled: true });
        source.addPanel({ id: 'a', component: 'default' });
        source.addPanel({ id: 'b', component: 'default' });
        const json = source.api.toJSON();
        expect(json.panels['a'].pinned).toBeUndefined();

        const target = make({ enabled: true });
        target.api.fromJSON(json);

        expect(target.api.getPanel('a')!.api.isPinned).toBe(false);
        expect(target.api.getPanel('b')!.api.isPinned).toBe(false);
    });
});

describe('pinned tabs: separate-row mode', () => {
    let container: HTMLElement;

    const make = (
        pinnedTabs: DockviewComponent['options']['pinnedTabs']
    ): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            pinnedTabs,
        });
        dockview.layout(1000, 1000);
        return dockview;
    };

    afterEach(() => {
        container.remove();
    });

    const row = () => container.querySelector('.dv-pinned-row');
    const rowTabs = () =>
        Array.from(container.querySelectorAll('.dv-pinned-tab'));
    const headerHasRowClass = () =>
        !!container.querySelector('.dv-tabs-and-actions-container--pinned-row');

    const seed = (dockview: DockviewComponent) => {
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        return { a, b };
    };

    test('pinning mounts a second row containing the pinned tab', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a } = seed(dockview);

        expect(row()).toBeNull();

        a.api.setPinned(true);

        expect(row()).not.toBeNull();
        expect(headerHasRowClass()).toBe(true);
        expect(rowTabs().map((el) => el.textContent)).toEqual(['a']);
    });

    test('unpinning the last pinned tab removes (collapses) the row', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a } = seed(dockview);

        a.api.setPinned(true);
        expect(row()).not.toBeNull();

        a.api.setPinned(false);
        expect(row()).toBeNull();
        expect(headerHasRowClass()).toBe(false);
    });

    test('clicking a row tab activates its panel', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a, b } = seed(dockview);

        a.api.setPinned(true);
        b.api.setActive();
        expect(a.api.isActive).toBe(false);

        fireEvent.click(rowTabs()[0]);
        expect(a.api.isActive).toBe(true);
    });

    test('clicking the unpin glyph unpins the panel and clears the row', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a } = seed(dockview);

        a.api.setPinned(true);
        const unpin = container.querySelector('.dv-pinned-tab-unpin')!;

        fireEvent.click(unpin);

        expect(a.api.isPinned).toBe(false);
        expect(row()).toBeNull();
    });

    test('the row tab label tracks the panel title', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a } = seed(dockview);

        a.api.setPinned(true);
        a.api.setTitle('Renamed');

        expect(rowTabs()[0].textContent).toBe('Renamed');
    });

    test('inline mode never mounts a second row', () => {
        const dockview = make({ enabled: true, mode: 'inline' });
        const { a } = seed(dockview);

        a.api.setPinned(true);

        expect(row()).toBeNull();
    });

    // Give each row tab a fixed geometry (jsdom has no layout): 20px-wide tabs
    // laid out left-to-right, so midpoints are [10, 30, 50, ...].
    const mockRowGeometry = () => {
        rowTabs().forEach((el, i) => {
            (el as HTMLElement).getBoundingClientRect = () =>
                ({
                    left: i * 20,
                    right: i * 20 + 20,
                    width: 20,
                    top: 0,
                    bottom: 16,
                    height: 16,
                    x: i * 20,
                    y: 0,
                    toJSON: () => ({}),
                }) as DOMRect;
        });
    };

    const drag = (fromId: string, clientX: number) => {
        const from = rowTabs().find(
            (el) => (el as HTMLElement).dataset.panelId === fromId
        )!;
        mockRowGeometry();
        from.dispatchEvent(new MouseEvent('dragstart', { bubbles: true }));
        from.dispatchEvent(
            new MouseEvent('dragover', { bubbles: true, clientX })
        );
        from.dispatchEvent(new MouseEvent('drop', { bubbles: true, clientX }));
    };

    const setupThreePinned = (dockview: DockviewComponent) => {
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        a.api.setPinned(true);
        b.api.setPinned(true);
        c.api.setPinned(true);
        const order = () => a.api.group.model.panels.map((p) => p.id);
        return { a, b, c, order };
    };

    test('dragging a row tab to the right reorders the pinned block', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a, order } = setupThreePinned(dockview);
        expect(order()).toEqual(['a', 'b', 'c']);
        expect(rowTabs().map((el) => el.textContent)).toEqual(['a', 'b', 'c']);

        const moveTo = jest.spyOn(a.api, 'moveTo');
        // Drop 'a' past every midpoint → it should land at index 2.
        drag('a', 55);

        expect(moveTo).toHaveBeenCalledWith({ index: 2, skipSetActive: true });
        expect(order()).toEqual(['b', 'c', 'a']);
        // The row DOM reconciles to the new order after the drop.
        expect(rowTabs().map((el) => el.textContent)).toEqual(['b', 'c', 'a']);
    });

    test('dragging a row tab to the front reorders the pinned block', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { c, order } = setupThreePinned(dockview);

        const moveTo = jest.spyOn(c.api, 'moveTo');
        // Drop 'c' before every midpoint → index 0.
        drag('c', 5);

        expect(moveTo).toHaveBeenCalledWith({ index: 0, skipSetActive: true });
        expect(order()).toEqual(['c', 'a', 'b']);
    });

    test('a no-op drop (same slot) issues no move', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { b } = setupThreePinned(dockview);

        const moveTo = jest.spyOn(b.api, 'moveTo');
        // Drop 'b' between tabs 0 and 1 → target index 1 === its current index.
        drag('b', 15);

        expect(moveTo).not.toHaveBeenCalled();
    });

    test('a reorder keeps the active panel active (skipSetActive)', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a, b } = setupThreePinned(dockview);
        b.api.setActive();
        expect(b.api.isActive).toBe(true);

        drag('a', 55); // reorder unrelated tab

        expect(b.api.isActive).toBe(true);
    });

    // The hidden main-strip tab element for a panel (still present under the
    // row in separate-row mode).
    const mainTabEl = (panel: { api: any }): HTMLElement => {
        const id = panel.api.group.model.header.getTabId(panel.id)!;
        return document.getElementById(id)!;
    };

    // Drive the main strip's HTML5 drag source: a native dragstart on a tab
    // populates the shared PanelTransfer that `getPanelData()` reads.
    const dragMainTabIntoRow = (panel: { api: any }, clientX: number) => {
        mockRowGeometry();
        mainTabEl(panel).dispatchEvent(
            new MouseEvent('dragstart', { bubbles: true })
        );
        const row = container.querySelector('.dv-pinned-row')!;
        row.dispatchEvent(
            new MouseEvent('dragover', { bubbles: true, clientX })
        );
        row.dispatchEvent(new MouseEvent('drop', { bubbles: true, clientX }));
        // Release the transfer (mirrors dragend) so it can't leak across tests.
        mainTabEl(panel).dispatchEvent(
            new MouseEvent('dragend', { bubbles: true })
        );
    };

    test('dragging an unpinned main-strip tab into the row pins it', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        a.api.setPinned(true); // row [a]; b, c unpinned
        const order = () => a.api.group.model.panels.map((p) => p.id);

        // Drop 'c' at the far right of the row → after the pinned block.
        dragMainTabIntoRow(c, 999);

        expect(c.api.isPinned).toBe(true);
        // Pinned block is now [a, c]; the unpinned 'b' stays behind it.
        expect(order()).toEqual(['a', 'c', 'b']);
        expect(rowTabs().map((el) => el.textContent)).toEqual(['a', 'c']);
    });

    test('pin-by-drag-in honours the drop slot within the pinned block', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        a.api.setPinned(true);
        b.api.setPinned(true); // row [a, b]; c unpinned
        const order = () => a.api.group.model.panels.map((p) => p.id);

        // Drop 'c' at the far left → slot 0, ahead of the pinned block.
        dragMainTabIntoRow(c, -5);

        expect(c.api.isPinned).toBe(true);
        expect(order()).toEqual(['c', 'a', 'b']);
    });

    test('a pinned main-strip tab dragged into the row is not re-pinned/moved', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        a.api.setPinned(true);
        b.api.setPinned(true); // both pinned
        const order = () => a.api.group.model.panels.map((p) => p.id);

        // 'b' is already pinned, so dropping its (hidden) main tab is a no-op.
        const moveTo = jest.spyOn(b.api, 'moveTo');
        dragMainTabIntoRow(b, 999);

        expect(moveTo).not.toHaveBeenCalled();
        expect(order()).toEqual(['a', 'b']);
    });

    test('a row tab drag exposes the panel payload for the main strip, then clears it', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const { a } = setupThreePinned(dockview);
        mockRowGeometry();
        const rowTab = rowTabs().find(
            (el) => (el as HTMLElement).dataset.panelId === 'a'
        )!;

        // dragstart mirrors the main tab's payload so the main strip's drop
        // targets accept the drag (viewId/groupId/panelId all match).
        rowTab.dispatchEvent(new MouseEvent('dragstart', { bubbles: true }));
        const data = getPanelData();
        expect(data?.panelId).toBe('a');
        expect(data?.groupId).toBe(a.api.group.id);
        expect(data?.viewId).toBe(dockview.id);

        // dragend releases the shared payload so it can't leak past the drag.
        rowTab.dispatchEvent(new MouseEvent('dragend', { bubbles: true }));
        expect(getPanelData()).toBeUndefined();
    });

    test('a pinned panel moved into a group renders in that group row', () => {
        const dockview = make({ enabled: true, mode: 'separate-row' });
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        a.api.setPinned(true);
        expect(rowTabs().map((el) => el.textContent)).toEqual(['a']);

        // A second group, then move the pinned panel into it. No pin-change
        // event fires, only onDidAddPanel on the destination group.
        const z = dockview.addPanel({
            id: 'z',
            component: 'default',
            position: { direction: 'right' },
        });
        a.api.moveTo({ group: z.api.group });

        // Exactly one pinned row tab ('a'), now living in the destination group.
        expect(rowTabs().map((el) => el.textContent)).toEqual(['a']);
        expect(a.api.group).toBe(z.api.group);
    });
});
