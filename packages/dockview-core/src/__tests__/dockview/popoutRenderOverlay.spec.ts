import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import type { IContentRenderer } from '../../dockview/types';
import type { OverlayRenderContainer } from '../../overlay/overlayRenderContainer';
import { setupMockWindow } from '../__mocks__/mockWindow';

// https://github.com/dockview/dockview/issues/1759

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {}
    layout(): void {}
    dispose(): void {}
}

function overlayIds(container: OverlayRenderContainer): string[] {
    return Array.from(
        container.element.querySelectorAll<HTMLElement>('.dv-render-overlay')
    )
        .map(
            (el) =>
                el
                    .querySelector('[data-testid]')
                    ?.getAttribute('data-testid') ?? '?'
        )
        .sort();
}

describe('single-panel moves across windows with renderer "always"', () => {
    const originalOpen = window.open;
    let container: HTMLElement;
    let dockview: DockviewComponent;

    beforeEach(() => {
        window.open = () => setupMockWindow();
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: (options) => {
                const panel = new TestPanel();
                panel.element.setAttribute('data-testid', options.id);
                return panel;
            },
            defaultRenderer: 'always',
        });
        dockview.layout(800, 400);
    });

    afterEach(() => {
        dockview.dispose();
        container.remove();
        window.open = originalOpen;
    });

    const popoutContainer = (group: DockviewGroupPanel) =>
        group.model.renderContainer;

    test('popping out one panel of a multi-panel group leaves no overlay behind', async () => {
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });

        expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a', 'b']);

        await dockview.addPopoutGroup(b);

        expect(b.group.api.location.type).toBe('popout');
        expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a']);
        expect(overlayIds(popoutContainer(b.group))).toEqual(['b']);
    });

    test('moving one panel out of a multi-panel popout group into a main group leaves no overlay behind', async () => {
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({
            id: 'b',
            component: 'default',
            position: { direction: 'right' },
        });
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: b },
        });

        await dockview.addPopoutGroup(b.group);
        const popoutGroup = b.group;
        const popoutRender = popoutContainer(popoutGroup);
        expect(overlayIds(popoutRender)).toEqual(['b', 'c']);

        c.api.moveTo({ group: a.group, position: 'center' });

        expect(c.group).toBe(a.group);
        expect(overlayIds(popoutRender)).toEqual(['b']);
        expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a', 'c']);
    });

    test('moving one panel out of a multi-panel popout group to the edge of a main group leaves no overlay behind', async () => {
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({
            id: 'b',
            component: 'default',
            position: { direction: 'right' },
        });
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: b },
        });

        await dockview.addPopoutGroup(b.group);
        const popoutRender = popoutContainer(b.group);

        c.api.moveTo({ group: a.group, position: 'right' });

        expect(c.group.api.location.type).toBe('grid');
        expect(overlayIds(popoutRender)).toEqual(['b']);
        expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a', 'c']);
    });

    test('moving one panel from a main group into a popout group leaves no overlay behind', async () => {
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { direction: 'right' },
        });

        await dockview.addPopoutGroup(c.group);
        const popoutRender = popoutContainer(c.group);

        b.api.moveTo({ group: c.group, position: 'center' });

        expect(b.group).toBe(c.group);
        expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a']);
        expect(overlayIds(popoutRender)).toEqual(['b', 'c']);
    });
    test('moving one panel between two popout windows leaves no overlay behind', async () => {
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({
            id: 'b',
            component: 'default',
            position: { direction: 'right' },
        });
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: b },
        });
        const d = dockview.addPanel({
            id: 'd',
            component: 'default',
            position: { direction: 'below' },
        });

        await dockview.addPopoutGroup(b.group);
        await dockview.addPopoutGroup(d.group);
        const first = popoutContainer(b.group);
        const second = popoutContainer(d.group);
        expect(first).not.toBe(second);

        c.api.moveTo({ group: d.group, position: 'center' });

        expect(c.group).toBe(d.group);
        expect(overlayIds(first)).toEqual(['b']);
        expect(overlayIds(second)).toEqual(['c', 'd']);
        expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a']);
    });

    test('a panel moved back from a popout keeps its content after the popout closes', async () => {
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({
            id: 'b',
            component: 'default',
            position: { direction: 'right' },
        });
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: b },
        });

        await dockview.addPopoutGroup(b.group);
        c.api.moveTo({ group: a.group, position: 'center' });

        b.group.api.moveTo({ group: a.group, position: 'right' });

        expect(b.group.api.location.type).toBe('grid');
        expect(overlayIds(dockview.overlayRenderContainer)).toEqual([
            'a',
            'b',
            'c',
        ]);
        expect(
            c.view.content.element.closest('.dv-render-overlay')
        ).not.toBeNull();
    });
});
