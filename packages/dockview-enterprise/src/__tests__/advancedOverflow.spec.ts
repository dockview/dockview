import { fireEvent } from '@testing-library/dom';
import { DockviewComponent, IContentRenderer } from 'dockview-core';
import { OverflowListView, matchesQuery } from '../advancedOverflowService';
import { MruTracker } from '../mruTracker';

// jsdom does not implement scrollIntoView; the core row activation + the view's
// active-row scroll both call it. Stub it so those paths don't throw.
beforeAll(() => {
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = function scrollIntoView() {
            /* noop */
        };
    }
});

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
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

// --- View-level helpers (a fake core render context) ---------------------------

interface FakePanel {
    id: string;
    title?: string;
}

function makeFakeContext(activateSpy?: (id: string) => void) {
    const liveRows = new Set<HTMLElement>();
    const opened: { body?: HTMLElement } = {};
    const closed = { count: 0 };
    const focused = { count: 0 };
    const context = {
        buildRow: (panelId: string) => {
            const element = document.createElement('div');
            element.className = 'dv-tab';
            element.dataset.panelId = panelId;
            element.textContent = panelId;
            liveRows.add(element);
            return {
                element,
                panel: { id: panelId } as any,
                activate: () => activateSpy?.(panelId),
                dispose: () => liveRows.delete(element),
            };
        },
        buildGroupHeader: () => undefined,
        buildPinnedHeader: () => {
            const el = document.createElement('div');
            el.className =
                'dv-tabs-overflow-group-header dv-tabs-overflow-pinned-header';
            el.textContent = 'Pinned';
            return el;
        },
        overflowGroupIdForPanel: () => undefined,
        open: (body: HTMLElement) => {
            opened.body = body;
            document.body.appendChild(body);
        },
        close: () => {
            closed.count++;
            opened.body?.remove();
        },
        focusTrigger: () => {
            focused.count++;
        },
    };
    return { context, opened, closed, focused, liveRows };
}

function makeParams(
    panels: FakePanel[],
    overflowTabs: string[],
    context: any,
    pinnedOverflowTabs: string[] = []
) {
    return {
        group: {
            id: 'g',
            panels,
        } as any,
        overflowTabs,
        overflowTabGroups: [] as string[],
        pinnedOverflowTabs,
        context,
    };
}

function optionRows(body: HTMLElement | undefined): string[] {
    if (!body) {
        return [];
    }
    return Array.from(
        body.querySelectorAll<HTMLElement>('[role="option"]')
    ).map((el) => el.dataset.panelId!);
}

describe('matchesQuery', () => {
    test('case-insensitive substring; empty query matches all', () => {
        expect(matchesQuery('Alpha', 'al')).toBe(true);
        expect(matchesQuery('Alpha', 'PH')).toBe(true);
        expect(matchesQuery('Alpha', 'z')).toBe(false);
        expect(matchesQuery('Alpha', '')).toBe(true);
        expect(matchesQuery('Alpha', '   ')).toBe(true);
    });
});

describe('OverflowListView: search scope', () => {
    afterEach(() => {
        document.body
            .querySelectorAll('.dv-tabs-overflow-container')
            .forEach((el) => el.remove());
    });

    test("scope 'group' (search: true) makes the FULL group tab set matchable", () => {
        const { context, opened } = makeFakeContext();
        const panels = [
            { id: 'a', title: 'alpha' },
            { id: 'b', title: 'beta' },
            { id: 'c', title: 'gamma' },
        ];
        // Only 'c' is actually clipped/overflowing.
        const view = new OverflowListView(
            makeParams(panels, ['c'], context),
            { search: true },
            new MruTracker(),
            false
        );
        view.open();

        // The full group set is rendered (switch to any tab), not just overflow.
        expect(optionRows(opened.body).sort()).toEqual(['a', 'b', 'c']);
        expect(
            opened.body!.querySelector('.dv-tabs-overflow-search')
        ).toBeTruthy();
        view.dispose();
    });

    test("scope 'overflow' filters only the clipped/overflow set (free parity)", () => {
        const { context, opened } = makeFakeContext();
        const panels = [
            { id: 'a', title: 'alpha' },
            { id: 'b', title: 'beta' },
            { id: 'c', title: 'gamma' },
        ];
        const view = new OverflowListView(
            makeParams(panels, ['b', 'c'], context),
            { search: { scope: 'overflow' } },
            new MruTracker(),
            false
        );
        view.open();

        expect(optionRows(opened.body).sort()).toEqual(['b', 'c']);
        view.dispose();
    });

    test('search disabled renders no input and shows the overflow set', () => {
        const { context, opened } = makeFakeContext();
        const panels = [
            { id: 'a', title: 'alpha' },
            { id: 'b', title: 'beta' },
        ];
        const view = new OverflowListView(
            makeParams(panels, ['b'], context),
            {},
            new MruTracker(),
            false
        );
        view.open();

        expect(
            opened.body!.querySelector('.dv-tabs-overflow-search')
        ).toBeNull();
        expect(optionRows(opened.body)).toEqual(['b']);
        view.dispose();
    });
});

describe('OverflowListView: pinned overflow section', () => {
    afterEach(() => {
        document.body
            .querySelectorAll('.dv-tabs-overflow-container')
            .forEach((el) => el.remove());
    });

    test('clipped pinned tabs render first, under a "Pinned" header', () => {
        const { context, opened } = makeFakeContext();
        const panels = [
            { id: 'a', title: 'alpha' },
            { id: 'b', title: 'beta' },
            { id: 'c', title: 'gamma' },
        ];
        const view = new OverflowListView(
            // 'c' clipped normally; 'a' + 'b' are clipped pinned tabs.
            makeParams(panels, ['c'], context, ['a', 'b']),
            { search: { scope: 'overflow' } },
            new MruTracker(),
            false
        );
        view.open();

        const header = opened.body!.querySelector(
            '.dv-tabs-overflow-pinned-header'
        );
        expect(header).toBeTruthy();
        expect(header!.textContent).toContain('Pinned');
        // Pinned rows first (strip order), then the regular overflow row.
        expect(optionRows(opened.body)).toEqual(['a', 'b', 'c']);
        view.dispose();
    });

    test('no orphan "Pinned" header when the pinned rows fail to build', () => {
        const { context, opened } = makeFakeContext();
        // Every row fails to build (e.g. its panel closed just before render).
        context.buildRow = () => undefined as any;
        const view = new OverflowListView(
            makeParams([{ id: 'a', title: 'alpha' }], [], context, ['a']),
            { search: { scope: 'overflow' } },
            new MruTracker(),
            false
        );
        view.open();

        expect(
            opened.body!.querySelector('.dv-tabs-overflow-pinned-header')
        ).toBeNull();
        expect(optionRows(opened.body)).toEqual([]);
        view.dispose();
    });

    test('group-scoped search does not duplicate a pinned tab in the main list', () => {
        const { context, opened } = makeFakeContext();
        const panels = [
            { id: 'a', title: 'alpha' },
            { id: 'b', title: 'beta' },
            { id: 'c', title: 'gamma' },
        ];
        const view = new OverflowListView(
            // scope 'group' would otherwise make every panel matchable, but the
            // pinned ones must appear only once (in the pinned section).
            makeParams(panels, ['c'], context, ['a']),
            { search: true },
            new MruTracker(),
            false
        );
        view.open();

        // 'a' appears exactly once, ahead of the group set.
        expect(optionRows(opened.body)).toEqual(['a', 'b', 'c']);
        expect(optionRows(opened.body).filter((id) => id === 'a')).toEqual([
            'a',
        ]);
        view.dispose();
    });

    test('search filters the pinned section; the header hides when nothing matches', () => {
        jest.useFakeTimers();
        try {
            const { context, opened } = makeFakeContext();
            const panels = [
                { id: 'a', title: 'alpha' },
                { id: 'b', title: 'beta' },
                { id: 'c', title: 'gamma' },
            ];
            const view = new OverflowListView(
                makeParams(panels, ['c'], context, ['a', 'b']),
                { search: { scope: 'overflow' } },
                new MruTracker(),
                false
            );
            view.open();

            const input = opened.body!.querySelector<HTMLInputElement>(
                '.dv-tabs-overflow-search'
            )!;
            input.value = 'gamma';
            input.dispatchEvent(new Event('input'));
            jest.advanceTimersByTime(80);

            // Only the non-pinned 'gamma' survives; the Pinned header is gone.
            expect(optionRows(opened.body)).toEqual(['c']);
            expect(
                opened.body!.querySelector('.dv-tabs-overflow-pinned-header')
            ).toBeNull();
            view.dispose();
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('OverflowListView: MRU ordering', () => {
    afterEach(() => {
        document.body
            .querySelectorAll('.dv-tabs-overflow-container')
            .forEach((el) => el.remove());
    });

    test('rows are ordered most-recently-activated first when mru is on', () => {
        const { context, opened } = makeFakeContext();
        const panels = [
            { id: 'a', title: 'a' },
            { id: 'b', title: 'b' },
            { id: 'c', title: 'c' },
        ];
        const mru = new MruTracker();
        mru.attach('g', ['a', 'b', 'c']);
        mru.activate('g', 'b'); // b most recent -> [b, a, c]

        const view = new OverflowListView(
            makeParams(panels, ['a', 'b', 'c'], context),
            { search: true, mru: true },
            mru,
            true
        );
        view.open();

        expect(optionRows(opened.body)).toEqual(['b', 'a', 'c']);
        view.dispose();
    });
});

describe('OverflowListView: search filtering + keyboard', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.useRealTimers();
        document.body
            .querySelectorAll('.dv-tabs-overflow-container')
            .forEach((el) => el.remove());
    });

    const setup = (activateSpy?: (id: string) => void) => {
        const fake = makeFakeContext(activateSpy);
        const panels = [
            { id: 'a', title: 'alpha' },
            { id: 'b', title: 'beta' },
            { id: 'c', title: 'gamma' },
        ];
        const view = new OverflowListView(
            makeParams(panels, ['a', 'b', 'c'], fake.context),
            { search: true },
            new MruTracker(),
            false
        );
        view.open();
        const input = fake.opened.body!.querySelector<HTMLInputElement>(
            '.dv-tabs-overflow-search'
        )!;
        return { view, input, ...fake };
    };

    test('typing filters rows (debounced) by title substring', () => {
        const { view, input, opened } = setup();
        expect(optionRows(opened.body)).toEqual(['a', 'b', 'c']);

        input.value = 'lph';
        fireEvent.input(input);
        jest.advanceTimersByTime(80);

        expect(optionRows(opened.body)).toEqual(['a']); // only "alpha"
        view.dispose();
    });

    test('re-rendering disposes the previous rows', () => {
        const { view, input, liveRows } = setup();
        expect(liveRows.size).toBe(3);

        input.value = 'lph';
        fireEvent.input(input);
        jest.advanceTimersByTime(80);

        expect(liveRows.size).toBe(1);
        view.dispose();
    });

    test('arrow keys rove the active option and wrap; Enter activates it', () => {
        const activated: string[] = [];
        const { view, input, opened } = setup((id) => activated.push(id));
        const body = opened.body!;

        const focused = () =>
            body.querySelector<HTMLElement>('.dv-tabs-overflow-option--focused')
                ?.dataset.panelId;

        // Initial active row is the first.
        expect(focused()).toBe('a');

        fireEvent.keyDown(body, { key: 'ArrowDown' });
        expect(focused()).toBe('b');

        fireEvent.keyDown(body, { key: 'ArrowUp' });
        fireEvent.keyDown(body, { key: 'ArrowUp' }); // wrap past the top
        expect(focused()).toBe('c');

        fireEvent.keyDown(body, { key: 'Home' });
        expect(focused()).toBe('a');
        fireEvent.keyDown(body, { key: 'End' });
        expect(focused()).toBe('c');

        fireEvent.keyDown(body, { key: 'Enter' });
        expect(activated).toEqual(['c']);
        void input;
        view.dispose();
    });

    test('Escape closes the popover and restores focus to the chevron', () => {
        const { view, opened, closed, focused } = setup();
        fireEvent.keyDown(opened.body!, { key: 'Escape' });
        expect(closed.count).toBe(1);
        expect(focused.count).toBe(1);
        view.dispose();
    });
});

// --- Full-component integration -----------------------------------------------

describe('advanced overflow: full component integration', () => {
    let container: HTMLElement;

    const make = (overflow: any): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            overflow,
        });
        dockview.layout(400, 300);
        return dockview;
    };

    afterEach(() => {
        container?.remove();
    });

    /** Force `ids` into the overflow set so the chevron renders, then open it. */
    const openOverflow = (
        dockview: DockviewComponent,
        anyPanel: any,
        ids: string[]
    ): HTMLElement | null => {
        const overflowSet = new Set(ids);
        anyPanel.group.model.header.setForcedOverflow((id: string) =>
            overflowSet.has(id)
        );
        anyPanel.group.model.header.refreshOverflow();

        const root = container.querySelector<HTMLElement>(
            '.dv-tabs-overflow-dropdown-root'
        );
        if (root) {
            fireEvent.click(root);
        }
        return container.querySelector<HTMLElement>(
            '.dv-tabs-overflow-advanced'
        );
    };

    test('the module upgrades the dropdown to the advanced (searchable) body', () => {
        const dockview = make({ search: true, mru: true });
        const panels = ['a', 'b', 'c', 'd'].map((id) =>
            dockview.addPanel({ id, component: 'default', title: id })
        );

        const body = openOverflow(dockview, panels[0], ['c', 'd']);
        expect(body).toBeTruthy();
        expect(body!.querySelector('.dv-tabs-overflow-search')).toBeTruthy();
        // scope 'group' (search: true) => every tab is reachable.
        expect(body!.querySelectorAll('[role="option"]')).toHaveLength(4);

        dockview.dispose();
    });

    test('MRU order reflects a user setActive sequence', () => {
        const dockview = make({ search: true, mru: true });
        const panels = ['a', 'b', 'c', 'd'].map((id) =>
            dockview.addPanel({ id, component: 'default', title: id })
        );

        // User activations. The UI wraps tab activation in `withOrigin('user')`
        // (a bare `setActive()` is origin 'api' and must not reorder recency).
        dockview.withOrigin('user', () => panels[2].api.setActive()); // c
        dockview.withOrigin('user', () => panels[1].api.setActive()); // b (most recent)

        const body = openOverflow(dockview, panels[0], ['c', 'd']);
        const order = Array.from(
            body!.querySelectorAll<HTMLElement>('[role="option"]')
        ).map((el) => el.textContent!.trim());

        // b then c lead (most-recently activated first).
        expect(order[0]).toBe('b');
        expect(order[1]).toBe('c');

        dockview.dispose();
    });

    test('clicking a row activates its panel and closes the popover', () => {
        const dockview = make({ search: true, mru: true });
        const panels = ['a', 'b', 'c', 'd'].map((id) =>
            dockview.addPanel({ id, component: 'default', title: id })
        );

        const body = openOverflow(dockview, panels[0], ['c', 'd']);
        const row = Array.from(
            body!.querySelectorAll<HTMLElement>('[role="option"]')
        ).find((el) => el.textContent!.trim() === 'd')!;

        fireEvent.click(row);

        expect(panels[3].api.isActive).toBe(true);
        expect(
            container.querySelector('.dv-tabs-overflow-advanced')
        ).toBeNull();

        dockview.dispose();
    });

    test('with the module registered the free flat list is not used', () => {
        const dockview = make({ search: true });
        const panels = ['a', 'b', 'c', 'd'].map((id) =>
            dockview.addPanel({ id, component: 'default', title: id })
        );

        openOverflow(dockview, panels[0], ['c', 'd']);
        // The advanced container carries the extra class; the plain free
        // container would not.
        const advanced = container.querySelector(
            '.dv-tabs-overflow-container.dv-tabs-overflow-advanced'
        );
        expect(advanced).toBeTruthy();

        dockview.dispose();
    });
});
