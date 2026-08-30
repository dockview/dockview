import { Droptarget } from '../../dnd/droptarget';
import { DropTargetAnchorContainer } from '../../dnd/dropTargetAnchorContainer';
import { fireEvent } from '@testing-library/dom';
import { createOffsetDragOverEvent } from '../__test_utils__/utils';

/**
 * The HTML5 backend renders anchored drop overlays into a shared container and
 * does not clear on `dragleave` (that would kill the overlay's slide between
 * adjacent targets). Instead it *schedules* a clear that a subsequent render
 * cancels, so the overlay slides between targets but is torn down when the
 * drag leaves to somewhere that doesn't re-render into the container.
 */
describe('Droptarget: deferred anchor-overlay clear on dragleave', () => {
    const flush = () => new Promise((r) => setTimeout(r, 5));

    function makeTarget(
        container: DropTargetAnchorContainer,
        opts?: {
            overrideDisabled?: boolean;
        }
    ) {
        const el = document.createElement('div');
        jest.spyOn(el, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(el, 'offsetHeight', 'get').mockReturnValue(30);
        el.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 100, height: 30 }) as DOMRect;
        const target = new Droptarget(el, {
            canDisplayOverlay: () => true,
            acceptedTargetZones: ['left', 'right'],
            getOverrideTarget: () =>
                opts?.overrideDisabled ? undefined : container.model,
        });
        return { el, target };
    }

    test('leaving a target to dead space tears the overlay down (no lingering overlay)', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const container = new DropTargetAnchorContainer(host, {
            disabled: false,
        });
        const { el, target } = makeTarget(container);

        fireEvent.dragEnter(el);
        fireEvent(el, createOffsetDragOverEvent({ clientX: 80, clientY: 15 }));
        expect(container.model?.exists()).toBe(true);

        // Drag is still active; cursor leaves to dead space (no re-render).
        fireEvent.dragLeave(el);
        // Not cleared synchronously (a sibling render this tick could reuse it).
        expect(container.model?.exists()).toBe(true);

        await flush();
        expect(container.model?.exists()).toBe(false);

        target.dispose();
        container.dispose();
        host.remove();
    });

    test('sliding to another target in the same container cancels the scheduled clear (overlay preserved)', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const container = new DropTargetAnchorContainer(host, {
            disabled: false,
        });
        const a = makeTarget(container);
        const b = makeTarget(container);

        fireEvent.dragEnter(a.el);
        fireEvent(
            a.el,
            createOffsetDragOverEvent({ clientX: 80, clientY: 15 })
        );
        expect(container.model?.exists()).toBe(true);

        // Cross from A to B (both render into the same container).
        fireEvent.dragLeave(a.el);
        fireEvent.dragEnter(b.el);
        fireEvent(
            b.el,
            createOffsetDragOverEvent({ clientX: 20, clientY: 15 })
        );

        await flush();
        // B's render cancelled A's scheduled clear: the overlay survives.
        expect(container.model?.exists()).toBe(true);

        a.target.dispose();
        b.target.dispose();
        container.dispose();
        host.remove();
    });

    test('leaving a floating-container target for an in-place (other-container) target clears it — no dragend needed', async () => {
        // This is the #1534 scenario (grid tab whose own container is disabled
        // renders in-place; floating tab anchors in a separate container),
        // resolved purely by the leave-scheduled clear: no `dragend` involved.
        const floatHost = document.createElement('div');
        document.body.appendChild(floatHost);
        const floatContainer = new DropTargetAnchorContainer(floatHost, {
            disabled: false,
        });
        const floatTab = makeTarget(floatContainer);
        // Grid tab: its override container is disabled -> in-place, no anchor.
        const gridContainer = new DropTargetAnchorContainer(
            document.createElement('div'),
            { disabled: true }
        );
        const gridTab = makeTarget(gridContainer, { overrideDisabled: true });

        // Hover the floating tab -> anchored overlay in floatContainer.
        fireEvent.dragEnter(floatTab.el);
        fireEvent(
            floatTab.el,
            createOffsetDragOverEvent({ clientX: 80, clientY: 15 })
        );
        expect(floatContainer.model?.exists()).toBe(true);

        // Move to the grid tab (in-place render, does not touch floatContainer).
        fireEvent.dragLeave(floatTab.el);
        fireEvent.dragEnter(gridTab.el);
        fireEvent(
            gridTab.el,
            createOffsetDragOverEvent({ clientX: 20, clientY: 15 })
        );

        await flush();
        // The floating overlay is gone even though the drag never ended.
        expect(floatContainer.model?.exists()).toBe(false);

        floatTab.target.dispose();
        gridTab.target.dispose();
        floatContainer.dispose();
        gridContainer.dispose();
        floatHost.remove();
    });
});
