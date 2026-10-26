import {
    DockviewComponent,
    DockviewEmitter as Emitter,
    IContentRenderer,
} from 'dockview';
import type {
    DockviewWillDropEvent,
    DockviewWillShowOverlayLocationEvent,
} from 'dockview';
import { AutoEdgeGroupService } from '../autoEdgeGroupService';

/**
 * Regression guards for issues found in the v8 pre-release review. Each test
 * encodes the correct behaviour and was first written to fail against the
 * unfixed code (see the accompanying fix commit). They run against the real
 * `DockviewComponent` (the enterprise jest setup registers every module and a
 * valid licence globally), so they exercise the shipped wiring, not mocks.
 */

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        /* noop */
    }
    layout(): void {
        /* noop */
    }
    dispose(): void {
        /* noop */
    }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r));

const peekHeader = (el: HTMLElement): Element | null =>
    el.querySelector('.dv-edge-peek-header');

describe('v8 review triage', () => {
    let container: HTMLElement;

    afterEach(() => {
        container?.remove();
        document.body.innerHTML = '';
    });

    /**
     * Issue: a drag-reveal drop onto a *pre-existing static* edge group flips it
     * to auto-hide. `AutoEdgeGroupService._onWillDrop` unconditionally calls
     * `revealEdgeGroupWithData(pos, data, { autoHide: true })`, and the reuse
     * branch of `revealEdgeGroupWithData` routes a defined `autoHide` through
     * `setEdgeGroupAutoHide`, mutating a group the user explicitly created static.
     * `autoEdgeGroups.mdx` promises dropping onto an existing edge "leaves the
     * group's state untouched".
     */
    test('drag-reveal onto an existing STATIC edge group must not convert it to auto-hide', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            autoHideEdgeGroups: false,
            dockToEdgeGroups: { left: true },
        });
        dockview.layout(1000, 1000);

        // Two panels in the main grid; we drag one toward the left edge.
        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        const sourceGroupId = dockview.panels.find((p) => p.id === 'p1')!.group
            .id;

        // A pre-existing STATIC (autoHide: false) left edge group.
        dockview.addEdgeGroup('left', {
            id: 'edge-left',
            initialSize: 200,
            autoHide: false,
        });
        dockview.addPanel({
            id: 'l1',
            component: 'default',
            position: { referenceGroup: 'edge-left' },
        });
        await flush();

        const edgeEl = dockview.getEdgeGroupPanel('left')!.element;
        // Sanity: static edge group has no tool-window (peek) chrome.
        expect(peekHeader(edgeEl)).toBeNull();

        // Drive the real drag-reveal path: a service whose host delegates
        // `revealEdgeGroupWithData` to the real component. Firing an outer-band
        // left-edge drop is exactly what a user dragging p1 into the left edge
        // band does.
        const rect = {
            left: 0,
            top: 0,
            right: 1000,
            bottom: 1000,
            width: 1000,
            height: 1000,
        } as DOMRect;
        const willShow = new Emitter<DockviewWillShowOverlayLocationEvent>();
        const willDrop = new Emitter<DockviewWillDropEvent>();
        const svcHost = {
            options: { dockToEdgeGroups: { left: true } },
            overlayRoot: document.createElement('div'),
            getDropZoneRect: () => rect,
            onWillShowOverlay: willShow.event,
            onWillDrop: willDrop.event,
            revealEdgeGroupWithData: (pos: any, data: any, opts: any): void =>
                dockview.revealEdgeGroupWithData(pos, data, opts),
        };
        const service = new AutoEdgeGroupService(svcHost as any);

        willDrop.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
            getData: () => ({ groupId: sourceGroupId, panelId: 'p1' }),
            preventDefault: () => undefined,
        } as any);
        await flush();

        // The drop landed: p1 is now in the left edge group (proves the gesture
        // was not a no-op).
        expect(
            dockview
                .getEdgeGroupPanel('left')!
                .model.panels.some((p) => p.id === 'p1')
        ).toBe(true);

        // The pre-existing static edge group must stay static: a drag-reveal
        // must not silently flip it to auto-hide.
        expect(
            peekHeader(dockview.getEdgeGroupPanel('left')!.element)
        ).toBeNull();

        service.dispose();
        dockview.dispose();
    });

    /**
     * Issue: `PinnedTabsService` reads `mode` only when a group is added and does
     * not subscribe to `onDidOptionsChange`, so switching `pinnedTabs.mode` at
     * runtime does not retrofit existing groups. A group created after the change
     * honours the new mode; a group that already existed does not.
     */
    test('switching pinnedTabs.mode to separate-row at runtime must retrofit existing groups', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            pinnedTabs: { enabled: true, mode: 'inline' },
        });
        dockview.layout(1000, 1000);

        // An existing group with a pinned panel, created under inline mode.
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        p1.api.setPinned(true);
        await flush();

        const originalGroup = dockview.panels.find((p) => p.id === 'p1')!.group;
        // Inline mode: no separate pinned row.
        expect(
            originalGroup.element.querySelector('.dv-pinned-row')
        ).toBeNull();

        // Switch to separate-row at runtime.
        dockview.updateOptions({
            pinnedTabs: { enabled: true, mode: 'separate-row' },
        });
        await flush();

        // Control: a NEW group created after the switch does honour separate-row.
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        p2.api.setPinned(true);
        await flush();
        const newGroup = dockview.panels.find((p) => p.id === 'p2')!.group;
        expect(newGroup.element.querySelector('.dv-pinned-row')).toBeTruthy();

        // The pre-existing group must be retrofitted with a pinned row too
        // (the onDidOptionsChange subscription reconciles existing groups).
        expect(
            originalGroup.element.querySelector('.dv-pinned-row')
        ).toBeTruthy();

        dockview.dispose();
    });

    /**
     * The reconciliation must work in both directions: switching from
     * separate-row back to inline at runtime tears the pinned row down on
     * existing groups (the else branch of the mode reconciliation).
     */
    test('switching pinnedTabs.mode back to inline at runtime tears down the pinned row', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            pinnedTabs: { enabled: true, mode: 'separate-row' },
        });
        dockview.layout(1000, 1000);

        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        p1.api.setPinned(true);
        await flush();

        const group = dockview.panels.find((p) => p.id === 'p1')!.group;
        // separate-row: the pinned row is present.
        expect(group.element.querySelector('.dv-pinned-row')).toBeTruthy();

        dockview.updateOptions({
            pinnedTabs: { enabled: true, mode: 'inline' },
        });
        await flush();

        // Back to inline: the pinned row is torn down on the existing group.
        expect(group.element.querySelector('.dv-pinned-row')).toBeNull();

        dockview.dispose();
    });
});
