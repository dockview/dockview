import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { GroupPanelPartInitParameters } from '../../dockview/types';
import { PanelUpdateEvent } from '../../panel/types';

class TestContentPart implements IContentRenderer {
    public element = document.createElement('div');

    constructor(public readonly id: string) {
        this.element.className = `content-part-${id}`;
    }

    init(_params: GroupPanelPartInitParameters): void {
        //
    }

    layout(_width: number, _height: number): void {
        //
    }

    update(_event: PanelUpdateEvent): void {
        //
    }

    dispose(): void {
        //
    }
}

/**
 * The free seam the `MultiRowTabsModule` consumes (PR-A): the tab-list element
 * exposed up through the group model + host, and the `relayoutGroup` host hook.
 * The module itself (wrap layout) is tested in `dockview-enterprise`.
 */
describe('multi-row tabs seam', () => {
    function createComponent() {
        return new DockviewComponent(document.createElement('div'), {
            createComponent(options) {
                switch (options.name) {
                    case 'component':
                        return new TestContentPart(options.id);
                    default:
                        throw new Error(`unsupported ${options.name}`);
                }
            },
        });
    }

    test('group model exposes the tab-list element (.dv-tabs-container)', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });

        const tabsList = panel.group.model.tabsListElement;
        expect(tabsList).toBeInstanceOf(HTMLElement);
        expect(tabsList.classList.contains('dv-tabs-container')).toBe(true);
        expect(panel.group.element.contains(tabsList)).toBe(true);

        cut.dispose();
    });

    test('host getTabsListElement returns the list, undefined when the header is hidden', () => {
        const cut = createComponent();

        const withHeader = cut.addPanel({ id: 'a', component: 'component' });
        expect(cut.getTabsListElement(withHeader.group)).toBe(
            withHeader.group.model.tabsListElement
        );

        const hidden = cut.addPanel({
            id: 'b',
            component: 'component',
            position: { direction: 'right' },
        });
        hidden.group.model.header.hidden = true;
        expect(cut.getTabsListElement(hidden.group)).toBeUndefined();

        cut.dispose();
    });

    test('host relayoutGroup re-runs the group layout', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });

        const spy = jest.spyOn(panel.group, 'relayout');
        cut.relayoutGroup(panel.group);
        expect(spy).toHaveBeenCalledTimes(1);

        cut.dispose();
    });

    test('overflow option is accepted and exposed on options', () => {
        const cut = new DockviewComponent(document.createElement('div'), {
            createComponent: (options) => new TestContentPart(options.id),
            overflow: { mode: 'wrap', maxRows: 2 },
        });

        expect(cut.options.overflow).toEqual({ mode: 'wrap', maxRows: 2 });

        cut.dispose();
    });

    test('tab elements carry their panel id (surplus-set lookup)', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });

        const tab =
            panel.group.model.tabsListElement.querySelector<HTMLElement>(
                '.dv-tab'
            )!;
        expect(tab.getAttribute('data-tab-panel-id')).toBe('panel1');

        cut.dispose();
    });

    test('host setForcedOverflow routes a panel into the dropdown even when nothing clips', () => {
        const cut = createComponent();
        const a = cut.addPanel({ id: 'a', component: 'component' });
        cut.addPanel({ id: 'b', component: 'component' });

        const dropdown = (): Element | null =>
            a.group.element.querySelector('.dv-tabs-overflow-dropdown-root');

        // jsdom has no layout, so nothing clips → no dropdown by default.
        expect(dropdown()).toBeNull();

        // Force 'b' into overflow (the wrap surplus set); the dropdown appears
        // although 'b' is not horizontally clipped.
        cut.setForcedOverflow(a.group, (id) => id === 'b');
        expect(dropdown()).not.toBeNull();

        cut.setForcedOverflow(a.group, () => false);
        expect(dropdown()).toBeNull();

        cut.dispose();
    });
});
