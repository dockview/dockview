import { createEvent, fireEvent } from '@testing-library/dom';
import type {
    DockviewIDisposable,
    IContentRenderer,
    SerializedDockview,
} from 'dockview-core';
import {
    DockviewApi,
    DockviewComponent,
    LocalSelectionTransfer,
    PanelTransfer,
} from 'dockview-core';
import type {
    MultiWindowDragPayload,
    MultiWindowMoveEvent,
    MultiWindow,
    MultiWindowTransport,
} from '../multiWindow';
import { installMultiWindow, MultiWindowOrchestrator } from '../multiWindow';
import { MULTI_WINDOW_DRAG_TYPE } from '../multiWindow/crossWindowDnd';
import { DRAG_END_GRACE_MS } from '../multiWindow/transport';
import { setupMockWindow } from '../../../dockview-core/src/__tests__/__mocks__/mockWindow';
import { DragSessions } from '../multiWindow/orchestrator/dragSessions';
import { HistorySequencer } from '../multiWindow/orchestrator/historySequencer';
import { WorkspaceRegistry } from '../multiWindow/orchestrator/workspaceRegistry';

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

const panelPayload = (id: string): MultiWindowDragPayload => ({
    kind: 'panel',
    panel: { id, contentComponent: 'default' },
});

const layoutWith = (...ids: string[]): SerializedDockview =>
    ({
        panels: Object.fromEntries(
            ids.map((id) => [id, { id, contentComponent: 'default' }])
        ),
    }) as unknown as SerializedDockview;

/** jsdom drops `clientX`/`clientY` from a drag event's init. */
function fireDrag(
    type: 'dragEnter' | 'dragOver' | 'drop',
    element: Element,
    dataTransfer: DataTransfer,
    at: { clientX: number; clientY: number }
): void {
    const event = createEvent[type](element, { dataTransfer });
    Object.defineProperty(event, 'clientX', { value: at.clientX });
    Object.defineProperty(event, 'clientY', { value: at.clientY });
    fireEvent(element, event);
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function endUnaccepted(
    element: HTMLElement,
    dataTransfer: DataTransfer
): Promise<void> {
    jest.useFakeTimers();
    try {
        fireEvent.dragEnd(element, { dataTransfer });
        await jest.advanceTimersByTimeAsync(DRAG_END_GRACE_MS);
    } finally {
        jest.useRealTimers();
    }
    await flush();
    await flush();
}

/** jsdom has no `DataTransfer`. */
function fakeDataTransfer(): DataTransfer {
    const data = new Map<string, string>();
    const transfer = {
        items: [] as unknown[],
        files: [] as unknown[],
        dropEffect: 'none',
        effectAllowed: 'all',
        setData: (type: string, value: string) => {
            data.set(type, value);
        },
        getData: (type: string) => data.get(type) ?? '',
        clearData: () => data.clear(),
        get types() {
            return Array.from(data.keys());
        },
        setDragImage: () => undefined,
    };
    return transfer as unknown as DataTransfer;
}

describe('multi-window: DragSessions', () => {
    test('an accept returns the payload and names the source to release', () => {
        const sessions = new DragSessions();
        sessions.start('s1', { from: 'main', payload: panelPayload('p') });

        const accept = sessions.accept('s1', 'dock-2');

        expect(accept.payload).toEqual(panelPayload('p'));
        expect(accept.release).toEqual({
            from: 'main',
            session: 's1',
            to: 'dock-2',
        });
    });

    test('the first accept wins and a peek leaves the drag in flight', () => {
        const sessions = new DragSessions();
        sessions.start('s1', { from: 'main', payload: panelPayload('p') });

        expect(sessions.peek('s1')).toEqual(panelPayload('p'));
        sessions.accept('s1', 'dock-2');

        expect(() => sessions.accept('s1', 'dock-3')).toThrow(
            'drag session s1 is not in flight'
        );
        expect(() => sessions.peek('nope')).toThrow(
            'drag session nope is not in flight'
        );
    });

    test('an ended drag is discarded, or parked for a detached window', () => {
        const sessions = new DragSessions();
        sessions.start('s1', { from: 'main', payload: panelPayload('p') });
        sessions.start('s2', { from: 'main', payload: panelPayload('q') });
        sessions.start('s3', { from: 'main', payload: panelPayload('r') });

        // Still in flight: nothing to settle.
        expect(sessions.expire('s1', () => 'x')).toEqual({
            outcome: 'settled',
        });

        expect(sessions.end('s1', false)).toBe(true);
        expect(sessions.expire('s1', () => 'x')).toEqual({
            outcome: 'discarded',
        });
        expect(() => sessions.peek('s1')).toThrow();

        expect(sessions.end('s2', true)).toBe(true);
        expect(sessions.expire('s2', () => 'detached-1')).toEqual({
            outcome: 'detached',
            windowId: 'detached-1',
            payload: panelPayload('q'),
            release: { from: 'main', session: 's2', to: 'detached-1' },
        });
        expect(sessions.takeDetachedDrag('detached-1')).toEqual(
            panelPayload('q')
        );
        expect(sessions.takeDetachedDrag('detached-1')).toBeNull();

        // An accept that arrived during the grace period wins over the end.
        sessions.end('s3', true);
        sessions.accept('s3', 'dock-2');
        expect(sessions.expire('s3', () => 'x')).toEqual({
            outcome: 'settled',
        });
        expect(sessions.end('s3', true)).toBe(false);
    });
});

describe('multi-window: WorkspaceRegistry', () => {
    test('refuses a layout naming a panel another window holds, unless a move explains it', () => {
        const registry = new WorkspaceRegistry();
        registry.setLayout('main', layoutWith('a', 'b'));

        expect(() => registry.setLayout('dock-2', layoutWith('b'))).toThrow(
            'panel b is already held by window main'
        );

        registry.expectMove(['b'], 'main', 'dock-2');
        // The destination may report first...
        registry.setLayout('dock-2', layoutWith('b'));
        // ...and the source reporting the panel gone completes the move.
        registry.setLayout('main', layoutWith('a'));
        // After which a duplicate is a duplicate again.
        expect(() => registry.setLayout('main', layoutWith('a', 'b'))).toThrow(
            'panel b is already held by window dock-2'
        );
    });

    test('snapshots round-trip, with frames, and an applied layout is trusted', () => {
        const registry = new WorkspaceRegistry();
        registry.ensureWindow('main');
        registry.setGeometry('main', { x: 1, y: 2, width: 300, height: 200 });
        registry.setLayout('main', layoutWith('a'));
        registry.setLayoutUnchecked('dock-2', layoutWith('a'));

        const snapshot = registry.snapshot();
        expect(snapshot.version).toBe(1);
        expect(snapshot.windows.map((window) => window.id)).toEqual([
            'main',
            'dock-2',
        ]);
        expect(snapshot.windows[0].geometry).toEqual({
            x: 1,
            y: 2,
            width: 300,
            height: 200,
        });

        const restored = new WorkspaceRegistry(snapshot);
        expect(restored.loadLayout('main')).toEqual(layoutWith('a'));
        expect(restored.loadLayout('nobody')).toBeNull();
        expect(restored.removeWindow('dock-2')?.id).toBe('dock-2');
        expect(restored.windowIds()).toEqual(['main']);

        expect(
            () => new WorkspaceRegistry({ version: 2, windows: [] })
        ).toThrow('workspace format 2 is not the supported 1');
    });
});

const empty = {
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
};

describe('multi-window: HistorySequencer', () => {
    const half = (window: string, before: string[], after: string[]) => ({
        window,
        before: layoutWith(...before),
        after: layoutWith(...after),
    });

    const apply = (window: string, layout: SerializedDockview) => ({
        window,
        request: { type: 'apply-layout', layout },
    });

    test('a move undoes destination first and redoes source first', () => {
        const history = new HistorySequencer();
        history.recordMove('s1', ['p'], 'to', half('dock-2', [], ['p']));
        expect(() => history.undo()).toThrow('move s1 is still being recorded');
        history.recordMove('s1', ['p'], 'from', half('main', ['p'], []));

        expect(history.info()).toEqual({
            canUndo: true,
            canRedo: false,
            undoCount: 1,
            redoCount: 0,
            nextUndo: {
                type: 'move',
                panels: ['p'],
                from: 'main',
                to: 'dock-2',
            },
        });

        const undo = history.undo();
        expect(undo.actions).toEqual([
            apply('dock-2', layoutWith()),
            apply('main', layoutWith('p')),
        ]);
        expect(undo.moved).toEqual({
            session: 's1',
            panels: ['p'],
            from: 'dock-2',
            to: 'main',
        });

        const redo = history.redo();
        expect(redo.actions).toEqual([
            apply('main', layoutWith()),
            apply('dock-2', layoutWith('p')),
        ]);
        expect(redo.moved?.to).toBe('dock-2');
        expect(() => history.redo()).toThrow('nothing to redo');
    });

    test('local steps are ordered against moves, trimmed, and dropped with their window', () => {
        const history = new HistorySequencer(3);
        history.pushLocal('main');
        history.recordMove('s1', ['p'], 'from', half('main', ['p'], []));
        history.recordMove('s1', ['p'], 'to', half('dock-2', [], ['p']));
        history.pushLocal('dock-2');

        expect(history.undo().actions).toEqual([
            { window: 'dock-2', request: { type: 'undo' } },
        ]);
        expect(history.undo().moved?.session).toBe('s1');
        expect(history.undo().actions).toEqual([
            { window: 'main', request: { type: 'undo' } },
        ]);
        expect(() => history.undo()).toThrow('nothing to undo');
        expect(history.redo().actions).toEqual([
            { window: 'main', request: { type: 'redo' } },
        ]);

        // A new step clears what could be redone.
        history.pushLocal('main');
        expect(history.info().redoCount).toBe(0);

        // Depth 3: the oldest entry falls off.
        history.pushLocal('main');
        history.pushLocal('main');
        expect(history.info().undoCount).toBe(3);

        history.forgetWindow('main');
        expect(history.info()).toEqual(empty);
    });

    test('a move missing a half is dropped with any window, so it cannot block undo', () => {
        const history = new HistorySequencer();
        history.recordMove('s1', ['p'], 'from', half('main', ['p'], []));
        // The destination closed before reporting its half.
        history.pushLocal('main');
        history.undo();
        expect(() => history.undo()).toThrow('still being recorded');

        history.forgetWindow('dock-2');

        expect(() => history.undo()).toThrow('nothing to undo');
        expect(history.redo().actions).toEqual([
            { window: 'main', request: { type: 'redo' } },
        ]);
    });

    test('a move one window never completes is dropped once abandoned, so it cannot block undo', () => {
        let now = 1000;
        const history = new HistorySequencer(undefined, () => now);
        history.pushLocal('main');
        history.recordMove('s1', ['p'], 'to', half('dock-2', [], ['p']));

        now += 5000;
        expect(() => history.undo()).toThrow('still being recorded');
        expect(history.info().undoCount).toBe(2);

        now += 5000;
        expect(() => history.undo()).toThrow(
            'move s1 was never completed; the history before it is dropped'
        );
        expect(history.info().undoCount).toBe(0);
    });

    test('a dropped move takes the steps beyond it, which assume it is undone first', () => {
        const history = new HistorySequencer();
        // dock-3 closes a tab while it holds p, then p moves to dock-2.
        history.pushLocal('dock-3');
        history.recordMove('s1', ['p'], 'from', half('dock-3', ['p'], []));
        history.recordMove('s1', ['p'], 'to', half('dock-2', [], ['p']));
        history.pushLocal('main');

        // Undoing dock-3's close would now bring p back alongside dock-2's.
        history.forgetWindow('dock-2');

        expect(history.undo().actions).toEqual([
            { window: 'main', request: { type: 'undo' } },
        ]);
        expect(() => history.undo()).toThrow('nothing to undo');
    });
});

describe('multi-window: two dockviews through MultiWindowOrchestrator', () => {
    interface Window {
        label: string;
        dockview: DockviewComponent;
        api: DockviewApi;
        mw: MultiWindow;
        dispose(): void;
    }

    const windows: Window[] = [];
    /** What the module reported through the console, as dockview does. */
    let reported: string[] = [];
    const report = (...args: unknown[]) => {
        reported.push(args.map(String).join(' '));
    };
    const reportedMatching = (pattern: RegExp) =>
        reported.filter((line) => pattern.test(line));

    beforeEach(() => {
        reported = [];
        jest.spyOn(console, 'warn').mockImplementation(report);
        jest.spyOn(console, 'error').mockImplementation(report);
    });

    const open = (
        orchestrator: MultiWindowOrchestrator,
        label: string,
        options: {
            buildDefaults?: () => void;
            detach?: boolean;
            layoutHistory?: {
                depth?: number;
                clearOnFromJSON?: boolean;
                undoableProgrammaticMutations?: boolean;
            };
        } = {}
    ): Window => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        let nextGroup = 0;
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            layoutHistory: {
                enabled: true,
                clearOnFromJSON: false,
                recordResize: false,
                ...options.layoutHistory,
            },
            // Group ids travel with a group; make them unique per window.
            groupIdGenerator: () => `${label}-${++nextGroup}`,
        });
        dockview.layout(800, 600);
        const api = new DockviewApi(dockview);
        const mw = installMultiWindow(api, orchestrator.connect(label), {
            detach: options.detach,
            debounceMs: 0,
            buildDefaults: options.buildDefaults,
        });
        const window: Window = {
            label,
            dockview,
            api,
            mw,
            dispose() {
                mw.dispose();
                dockview.dispose();
                container.remove();
            },
        };
        windows.push(window);
        return window;
    };

    const ids = (window: Window) => window.api.panels.map((p) => p.id).sort();

    const sized = (element: HTMLElement) => {
        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);
        return element;
    };

    /** A real HTML5 drag gesture: start on `source`'s tab, drop on `onto` in `target`. */
    const dragAcross = async (
        source: Window,
        panelId: string,
        target: Window,
        onto: HTMLElement = target.dockview.element.querySelector(
            '.dv-content-container'
        ) as HTMLElement,
        at: { clientX: number; clientY: number } = { clientX: 50, clientY: 50 },
        afterStart: () => void = () => undefined
    ) => {
        const dataTransfer = fakeDataTransfer();
        const tab = source.api.getPanel(panelId)?.view.tab.element;
        if (!tab) {
            throw new Error(`no tab for ${panelId}`);
        }
        sized(onto);

        fireEvent.dragStart(tab, { dataTransfer });
        expect(dataTransfer.types).toContain(MULTI_WINDOW_DRAG_TYPE);
        await flush();
        afterStart();

        fireDrag('dragEnter', onto, dataTransfer, at);
        fireDrag('dragOver', onto, dataTransfer, at);
        fireDrag('drop', onto, dataTransfer, at);
        await flush();
        await flush();

        dataTransfer.dropEffect = 'move';
        fireEvent.dragEnd(tab, { dataTransfer });
        await flush();
        return dataTransfer;
    };

    afterEach(() => {
        for (const window of windows.splice(0)) {
            window.dispose();
        }
        jest.restoreAllMocks();
    });

    test('a tab dropped on another window moves there, with undo and redo through the orchestrator', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const moves: MultiWindowMoveEvent[] = [];
        orchestrator.onDidMove((notice) => moves.push(notice));
        const main = open(orchestrator, 'main');
        const other = open(orchestrator, 'other');
        await flush();

        main.api.addPanel({ id: 'a', component: 'default', title: 'A' });
        main.api.addPanel({
            id: 'b',
            component: 'default',
            params: { n: 1 },
            position: { referencePanel: 'a', direction: 'right' },
        });
        other.api.addPanel({ id: 'x', component: 'default' });
        await flush();

        await dragAcross(main, 'b', other);

        expect(ids(main)).toEqual(['a']);
        expect(ids(other)).toEqual(['b', 'x']);
        expect(other.api.getPanel('b')?.params).toEqual({ n: 1 });
        expect(moves).toEqual([
            expect.objectContaining({
                panels: ['b'],
                from: 'main',
                to: 'other',
                reason: 'drop',
            }),
        ]);
        // Neither window's report was refused as a duplicate.
        await flush();
        expect(reported).toEqual([]);
        const held = (label: string) =>
            Object.keys(
                orchestrator
                    .snapshot()
                    .windows.find((window) => window.id === label)?.layout
                    ?.panels ?? {}
            ).sort();
        expect(held('main')).toEqual(['a']);
        expect(held('other')).toEqual(['b', 'x']);

        expect(orchestrator.history).toEqual(
            expect.objectContaining({
                undoCount: 1,
                nextUndo: {
                    type: 'move',
                    panels: ['b'],
                    from: 'main',
                    to: 'other',
                },
            })
        );

        orchestrator.undo();
        await flush();
        expect(ids(main)).toEqual(['a', 'b']);
        expect(ids(other)).toEqual(['x']);
        expect(moves[1]).toEqual(
            expect.objectContaining({
                from: 'other',
                to: 'main',
                reason: 'undo',
            })
        );
        // Undo via a window's own shared history reaches the same stack.
        expect(orchestrator.history.redoCount).toBe(1);

        orchestrator.redo();
        await flush();
        expect(ids(main)).toEqual(['a']);
        expect(ids(other)).toEqual(['b', 'x']);
        expect(moves[2]).toEqual(
            expect.objectContaining({
                from: 'main',
                to: 'other',
                reason: 'redo',
            })
        );
        await flush();
        expect(reported).toEqual([]);
    });

    test('a drop is refused, and nothing released, when the window already holds the panel', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'same', component: 'default' });
        other.api.addPanel({ id: 'same', component: 'default' });

        await dragAcross(main, 'same', other);

        expect(ids(main)).toEqual(['same']);
        expect(ids(other)).toEqual(['same']);
        expect(reportedMatching(/already holds/)).toEqual([
            'dockview: refused a drop of same, which this window already holds.',
        ]);
        expect(orchestrator.history.undoCount).toBe(0);
    });

    test('a group drag carries every tab of the group', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        other.api.addPanel({ id: 'x', component: 'default' });

        const dataTransfer = fakeDataTransfer();
        const voidContainer = main.dockview.element.querySelector(
            '.dv-void-container'
        ) as HTMLElement;
        const content = sized(
            other.dockview.element.querySelector(
                '.dv-content-container'
            ) as HTMLElement
        );

        fireEvent.dragStart(voidContainer, { dataTransfer });
        await flush();
        // Dropped at the right edge: a new group beside the target.
        const at = { clientX: 95, clientY: 50 };
        fireDrag('dragEnter', content, dataTransfer, at);
        fireDrag('dragOver', content, dataTransfer, at);
        fireDrag('drop', content, dataTransfer, at);
        await flush();
        await flush();

        expect(ids(main)).toEqual([]);
        expect(ids(other)).toEqual(['a', 'b', 'x']);
        expect(other.api.groups).toHaveLength(2);
        expect(
            other.api.getPanel('a')?.group.panels.map((panel) => panel.id)
        ).toEqual(['a', 'b']);
    });

    test('a drop on a tab lands at that tab, through the drop index', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'b', component: 'default' });
        other.api.addPanel({ id: 'x', component: 'default' });
        other.api.addPanel({ id: 'y', component: 'default' });
        // The drop target is the tab's wrapper, not the renderer inside it.
        const yTab = other.api
            .getPanel('y')
            ?.view.tab.element.closest('.dv-tab') as HTMLElement;

        // The left half of y's tab: before y.
        await dragAcross(main, 'b', other, yTab, { clientX: 10, clientY: 10 });

        expect(ids(main)).toEqual([]);
        expect(
            other.api.getPanel('y')?.group.panels.map((panel) => panel.id)
        ).toEqual(['x', 'b', 'y']);
    });

    test('an unaccepted drag with detach becomes a new window holding the tab', async () => {
        const created: string[] = [];
        const defaultsBuilt: string[] = [];
        const orchestrator = new MultiWindowOrchestrator({
            createWindow: (label) => {
                created.push(label);
                open(orchestrator, label, {
                    buildDefaults: () => defaultsBuilt.push(label),
                });
            },
        });
        const main = open(orchestrator, 'main');
        // Detach can be switched on at any time, as a host's setting would.
        main.mw.updateOptions({ detach: true });
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default', title: 'Bee' });

        const dataTransfer = fakeDataTransfer();
        const tab = main.api.getPanel('b')?.view.tab.element as HTMLElement;
        fireEvent.dragStart(tab, { dataTransfer });
        await flush();
        // No drop anywhere: the drag ends with nothing dropped.
        await endUnaccepted(tab, dataTransfer);

        expect(created).toEqual(['detached-1']);
        const detached = windows.find(
            (window) => window.label === 'detached-1'
        );
        expect(detached && ids(detached)).toEqual(['b']);
        expect(detached?.api.getPanel('b')?.title).toBe('Bee');
        expect(ids(main)).toEqual(['a']);
        // The new window starts with what was dragged, not its defaults.
        expect(defaultsBuilt).toEqual([]);
    });

    test('a local step is ordered against a move, and undone through the window', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        main.api.addPanel({ id: 'c', component: 'default' });
        other.api.addPanel({ id: 'x', component: 'default' });
        await flush();
        expect(orchestrator.history.undoCount).toBe(0);

        // A user closes a tab: a local step, reported to the orchestrator.
        const closeC = main.api
            .getPanel('c')
            ?.view.tab.element.querySelector(
                '.dv-default-tab-action'
            ) as HTMLElement;
        fireEvent.click(closeC);
        await flush();
        expect(ids(main)).toEqual(['a', 'b']);
        expect(main.dockview.canUndo).toBe(true);
        expect(orchestrator.history).toEqual(
            expect.objectContaining({
                undoCount: 1,
                nextUndo: { type: 'local', windowId: 'main' },
            })
        );

        await dragAcross(main, 'b', other);
        expect(ids(other)).toEqual(['b', 'x']);
        expect(orchestrator.history).toEqual(
            expect.objectContaining({
                undoCount: 2,
                nextUndo: expect.objectContaining({ type: 'move' }),
            })
        );

        // Undo through a window's own shared history: the move first...
        const infos: number[] = [];
        main.mw.onDidChangeHistory((info) => infos.push(info.undoCount));
        main.mw.undo();
        await flush();
        expect(ids(main)).toEqual(['a', 'b']);
        expect(ids(other)).toEqual(['x']);
        expect(main.mw.history).toEqual(
            expect.objectContaining({ undoCount: 1, redoCount: 1 })
        );
        // ...then the local step, carried out by main's own history.
        main.mw.undo();
        await flush();
        expect(ids(main)).toEqual(['a', 'b', 'c']);
        expect(main.mw.history.undoCount).toBe(0);
        expect(infos).toEqual([1, 0]);
        // Neither instruction was reported back as a new step.
        expect(orchestrator.history.redoCount).toBe(2);

        main.mw.redo();
        await flush();
        expect(ids(main)).toEqual(['a', 'b']);
        main.mw.redo();
        await flush();
        expect(ids(main)).toEqual(['a']);
        expect(ids(other)).toEqual(['b', 'x']);
        expect(orchestrator.history).toEqual(
            expect.objectContaining({ undoCount: 2, redoCount: 0 })
        );

        // Nothing left to redo: reported, not thrown.
        main.mw.redo();
        await flush();
        expect(reported).toContain(
            'dockview: could not redo. Error: nothing to redo'
        );
    });

    test('with history off, undo stays local to the window', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        const local = installMultiWindow(
            main.api,
            orchestrator.connect('main'),
            {
                history: false,
                workspace: false,
            }
        );
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        fireEvent.click(
            main.api
                .getPanel('b')
                ?.view.tab.element.querySelector(
                    '.dv-default-tab-action'
                ) as HTMLElement
        );
        expect(ids(main)).toEqual(['a']);

        expect(local.history).toEqual(empty);
        expect(typeof local.onDidChangeHistory(() => undefined).dispose).toBe(
            'function'
        );
        local.undo();
        expect(ids(main)).toEqual(['a', 'b']);
        local.redo();
        expect(ids(main)).toEqual(['a']);
        local.dispose();
    });

    test('a layout that cannot be restored falls back to the defaults', async () => {
        const orchestrator = new MultiWindowOrchestrator({
            workspace: {
                version: 1,
                windows: [
                    {
                        id: 'main',
                        layout: {
                            grid: { root: { type: 'leaf' } },
                        } as unknown as SerializedDockview,
                    },
                ],
            },
        });
        const main = open(orchestrator, 'main', {
            buildDefaults: () =>
                main.api.addPanel({ id: 'fallback', component: 'default' }),
        });
        await flush();
        await flush();

        expect(ids(main)).toEqual(['fallback']);
        await expect(main.mw.ready).resolves.toEqual({ restored: false });
        expect(
            reportedMatching(/could not restore the layout; building defaults/)
        ).toHaveLength(1);
        orchestrator.setGeometry('main', { x: 0, y: 0, width: 10, height: 10 });
        expect(orchestrator.snapshot().windows[0].geometry?.width).toBe(10);
    });

    test('a drop at a layout edge opens a new group there', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'b', component: 'default' });
        other.api.addPanel({ id: 'x', component: 'default' });

        // A separate window never sees main's in-heap transfer data.
        const leaveHeap = () =>
            LocalSelectionTransfer.getInstance().clearData(
                PanelTransfer.prototype
            );
        await dragAcross(
            main,
            'b',
            other,
            other.dockview.element,
            { clientX: 2, clientY: 50 },
            leaveHeap
        );

        expect(ids(main)).toEqual([]);
        expect(ids(other)).toEqual(['b', 'x']);
        expect(other.api.groups).toHaveLength(2);
        expect(other.api.getPanel('b')?.group.api.location.type).toBe('grid');
    });

    test('a detached group starts the new window with every tab', async () => {
        const orchestrator = new MultiWindowOrchestrator({
            createWindow: (label) => {
                open(orchestrator, label);
            },
        });
        const main = open(orchestrator, 'main', { detach: true });
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });

        const dataTransfer = fakeDataTransfer();
        const voidContainer = main.dockview.element.querySelector(
            '.dv-void-container'
        ) as HTMLElement;
        fireEvent.dragStart(voidContainer, { dataTransfer });
        await flush();
        await endUnaccepted(voidContainer, dataTransfer);

        const detached = windows.find(
            (window) => window.label === 'detached-1'
        );
        expect(detached && ids(detached)).toEqual(['a', 'b']);
        expect(ids(main)).toEqual([]);
        expect(main.api.getGroup('main-1')).toBeUndefined();
    });

    test('a detach is not a move the shared history records, and the new window reports cleanly', async () => {
        const orchestrator = new MultiWindowOrchestrator({
            createWindow: (label) => {
                open(orchestrator, label);
            },
        });
        const moves: MultiWindowMoveEvent[] = [];
        orchestrator.onDidMove((notice) => moves.push(notice));
        const main = open(orchestrator, 'main', { detach: true });
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        await flush();

        const dataTransfer = fakeDataTransfer();
        const tab = main.api.getPanel('b')?.view.tab.element as HTMLElement;
        fireEvent.dragStart(tab, { dataTransfer });
        await flush();
        await endUnaccepted(tab, dataTransfer);

        const detached = windows.find(
            (window) => window.label === 'detached-1'
        );
        expect(detached && ids(detached)).toEqual(['b']);
        expect(ids(main)).toEqual(['a']);
        expect(moves).toEqual([
            expect.objectContaining({
                panels: ['b'],
                from: 'main',
                to: 'detached-1',
                reason: 'detach',
            }),
        ]);
        await flush();
        expect(reported).toEqual([]);
        // No half-recorded move is left behind.
        expect(orchestrator.history.undoCount).toBe(0);
        main.mw.undo();
        await flush();
        expect(reported).toContain(
            'dockview: could not undo. Error: nothing to undo'
        );
        expect(ids(main)).toEqual(['a']);
    });

    test('a transport written as a class keeps its methods and its this', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        type Transport = MultiWindowTransport;
        class Bridge implements MultiWindowTransport {
            calls = 0;
            constructor(private readonly inner: Transport) {}
            get windowId() {
                return this.inner.windowId;
            }
            private count<T>(value: T): T {
                this.calls += 1;
                return value;
            }
            startDrag(...args: Parameters<Transport['startDrag']>) {
                return this.count(this.inner.startDrag(...args));
            }
            peekDrag(session: string) {
                return this.count(this.inner.peekDrag(session));
            }
            acceptDrag(session: string) {
                return this.count(this.inner.acceptDrag(session));
            }
            endDrag(session: string, detach: boolean) {
                return this.count(this.inner.endDrag(session, detach));
            }
            onDidRelease(...args: Parameters<Transport['onDidRelease']>) {
                return this.count(this.inner.onDidRelease(...args));
            }
            takeDetachedDrag() {
                return this.count(this.inner.takeDetachedDrag());
            }
            reportMove(...args: Parameters<Transport['reportMove']>) {
                return this.count(this.inner.reportMove(...args));
            }
            onDidMove(...args: Parameters<Transport['onDidMove']>) {
                return this.count(this.inner.onDidMove(...args));
            }
            loadLayout() {
                return this.count(this.inner.loadLayout());
            }
            reportLayout(layout: SerializedDockview) {
                return this.count(this.inner.reportLayout(layout));
            }
            reportLocalStep() {
                return this.count(this.inner.reportLocalStep());
            }
            undo() {
                return this.count(this.inner.undo());
            }
            redo() {
                return this.count(this.inner.redo());
            }
            getHistory() {
                return this.count(this.inner.getHistory());
            }
            onDidRequestHistory(
                ...args: Parameters<Transport['onDidRequestHistory']>
            ) {
                return this.count(this.inner.onDidRequestHistory(...args));
            }
            onDidChangeHistory(
                ...args: Parameters<Transport['onDidChangeHistory']>
            ) {
                return this.count(this.inner.onDidChangeHistory(...args));
            }
        }
        const bridge = new Bridge(orchestrator.connect('main'));
        const main = open(orchestrator, 'main');
        const handle = installMultiWindow(main.api, bridge, {
            debounceMs: 0,
        });
        await flush();
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'b', component: 'default' });
        other.api.addPanel({ id: 'x', component: 'default' });
        await flush();
        expect(bridge.calls).toBeGreaterThan(5);

        await dragAcross(main, 'b', other);
        expect(ids(other)).toEqual(['b', 'x']);
        expect(handle.windowId).toBe('main');
        handle.dispose();
    });

    test('a subscription that answers after dispose is dropped at once', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const transport = orchestrator.connect('main');
        const unlisten = jest.fn();
        let answer: (value: DockviewIDisposable) => void = () => undefined;
        const late = new Promise<DockviewIDisposable>((resolve) => {
            answer = resolve;
        });
        const main = open(orchestrator, 'main');
        const handle = installMultiWindow(
            main.api,
            { ...transport, onDidRelease: () => late },
            { workspace: false, history: false }
        );
        handle.dispose();
        answer({ dispose: unlisten });
        await flush();
        expect(unlisten).toHaveBeenCalledTimes(1);
    });

    test('an orchestrator that cannot be reached at start still gets the defaults', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const transport = orchestrator.connect('main');
        const main = open(orchestrator, 'main');
        const handle = installMultiWindow(
            main.api,
            {
                ...transport,
                loadLayout: () => Promise.reject(new Error('not yet')),
            },
            {
                buildDefaults: () =>
                    main.api.addPanel({ id: 'home', component: 'default' }),
            }
        );
        await expect(handle.ready).resolves.toEqual({ restored: false });
        expect(ids(main)).toEqual(['home']);
        expect(
            reportedMatching(
                /no layout from the orchestrator; building defaults/
            )
        ).toHaveLength(1);
        handle.dispose();
    });

    test('the workspace restores a window from the orchestrator and reports changes back', async () => {
        const seed = new MultiWindowOrchestrator();
        const seedWindow = open(seed, 'main');
        seedWindow.api.addPanel({ id: 'kept', component: 'default' });
        const layout = seedWindow.api.toJSON();
        seedWindow.dispose();
        windows.length = 0;

        const orchestrator = new MultiWindowOrchestrator({
            workspace: {
                version: 1,
                windows: [{ id: 'main', layout }],
            },
        });
        const changes: string[][] = [];
        orchestrator.onDidChangeWorkspace((state) =>
            changes.push(state.windows.map((window) => window.id))
        );
        const main = open(orchestrator, 'main');
        let defaultsBuilt = 0;
        const other = open(orchestrator, 'other', {
            buildDefaults: () => {
                defaultsBuilt += 1;
                other.api.addPanel({ id: 'kept', component: 'default' });
            },
        });
        await flush();
        await flush();

        expect(ids(main)).toEqual(['kept']);
        await expect(main.mw.ready).resolves.toEqual({ restored: true });
        expect(defaultsBuilt).toBe(1);
        // The second window's defaults collide with the first's panel, so
        // its report is refused and the workspace keeps the first.
        expect(reportedMatching(/layout refused/)).toEqual([
            'dockview: layout refused. Error: panel kept is already held by window main',
        ]);
        expect(changes.length).toBeGreaterThan(0);
        expect(orchestrator.windowIds).toEqual(['main', 'other']);

        orchestrator.disconnect('other');
        expect(orchestrator.windowIds).toEqual(['main']);
    });

    const closeTab = (window: Window, id: string) =>
        fireEvent.click(
            window.api
                .getPanel(id)
                ?.view.tab.element.querySelector(
                    '.dv-default-tab-action'
                ) as HTMLElement
        );

    test('local steps keep reaching the orchestrator once the local history is full', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main', {
            layoutHistory: { depth: 2 },
        });
        await flush();
        for (const id of ['a', 'b', 'c', 'd']) {
            main.api.addPanel({ id, component: 'default' });
        }
        for (const id of ['d', 'c', 'b']) {
            closeTab(main, id);
            await flush();
        }
        // The local stack holds two; every step was still sequenced.
        expect(main.dockview.canUndo).toBe(true);
        expect(orchestrator.history.undoCount).toBe(3);
    });

    test('an applied layout that clears the local history is reported once', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main', {
            layoutHistory: { clearOnFromJSON: true },
        });
        const other = open(orchestrator, 'other');
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        other.api.addPanel({ id: 'x', component: 'default' });
        closeTab(main, 'a');
        await flush();

        await dragAcross(main, 'b', other);
        orchestrator.undo();
        await flush();

        expect(
            reportedMatching(/layoutHistory.clearOnFromJSON set to false/)
        ).toHaveLength(1);
    });

    test("a detach ends the source window's earlier steps", async () => {
        const orchestrator = new MultiWindowOrchestrator({
            createWindow: (label) => {
                open(orchestrator, label);
            },
        });
        const main = open(orchestrator, 'main', { detach: true });
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        main.api.addPanel({ id: 'c', component: 'default' });
        closeTab(main, 'c');
        await flush();
        expect(orchestrator.history.undoCount).toBe(1);

        const dataTransfer = fakeDataTransfer();
        const tab = main.api.getPanel('b')?.view.tab.element as HTMLElement;
        fireEvent.dragStart(tab, { dataTransfer });
        await flush();
        await endUnaccepted(tab, dataTransfer);

        // Undoing the close would restore a layout that still holds b.
        expect(orchestrator.history.undoCount).toBe(0);
        expect(ids(main)).toEqual(['a']);
    });

    test('a detached window never takes the id of a window on record', async () => {
        const created: string[] = [];
        const orchestrator = new MultiWindowOrchestrator({
            workspace: { version: 1, windows: [{ id: 'detached-1' }] },
            createWindow: (label) => {
                created.push(label);
                open(orchestrator, label);
            },
        });
        const main = open(orchestrator, 'main', { detach: true });
        await flush();
        main.api.addPanel({ id: 'b', component: 'default' });

        const dataTransfer = fakeDataTransfer();
        const tab = main.api.getPanel('b')?.view.tab.element as HTMLElement;
        fireEvent.dragStart(tab, { dataTransfer });
        await flush();
        await endUnaccepted(tab, dataTransfer);

        expect(created).toEqual(['detached-2']);
    });

    test('a recorded programmatic mutation is reported once as a broken option', async () => {
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main', {
            layoutHistory: { undoableProgrammaticMutations: true },
        });
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({ id: 'b', component: 'default' });
        await flush();

        expect(
            reportedMatching(/undoableProgrammaticMutations set to false/)
        ).toHaveLength(1);
    });

    test('a popout group is reported once as unsupported', async () => {
        const open_ = jest
            .spyOn(window, 'open')
            .mockImplementation(() => setupMockWindow());
        const orchestrator = new MultiWindowOrchestrator();
        const main = open(orchestrator, 'main');
        await flush();
        main.api.addPanel({ id: 'a', component: 'default' });
        main.api.addPanel({
            id: 'b',
            component: 'default',
            position: { referencePanel: 'a', direction: 'right' },
        });
        await flush();

        await main.api.addPopoutGroup(main.api.getPanel('a')!.group);
        await main.api.addPopoutGroup(main.api.getPanel('b')!.group);
        await flush();
        expect(main.api.getPanel('a')?.group.api.location.type).toBe('popout');

        expect(
            reportedMatching(/popout groups are not supported/)
        ).toHaveLength(1);
        open_.mockRestore();
    });
});
