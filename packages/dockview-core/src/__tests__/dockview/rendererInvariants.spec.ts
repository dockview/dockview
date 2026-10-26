import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { IContentRenderer } from '../../dockview/types';
import type { PanelUpdateEvent } from '../../panel/types';
import { Orientation } from '../../splitview/splitview';
import { OverlayRenderContainer } from '../../overlay/overlayRenderContainer';
import type { DockviewPanelRenderer } from '../../overlay/types';

/**
 * Every combination of active/inactive renderer through every path that adds
 * or re-registers an inactive panel next to an active one. After each step:
 * the active panel is mounted (content container for `onlyWhenVisible`, overlay
 * for `always`), inactive panels are never in the content container, and
 * onShow/onHide stay balanced.
 */

const counts: Record<string, { show: number; hide: number }> = {};

class Part implements IContentRenderer {
    element = document.createElement('div');

    constructor(public readonly id: string) {
        counts[id] = { show: 0, hide: 0 };
    }

    init(): void {}
    layout(): void {}
    update(_event: PanelUpdateEvent): void {}
    focus(): void {}
    dispose(): void {}
    onShow(): void {
        counts[this.id].show++;
    }
    onHide(): void {
        counts[this.id].hide++;
    }
}

function create(defaultRenderer?: DockviewPanelRenderer): DockviewComponent {
    const dockview = new DockviewComponent(document.createElement('div'), {
        createComponent: (options) => new Part(options.id),
        defaultRenderer,
    });
    dockview.layout(1000, 1000);
    return dockview;
}

function check(dockview: DockviewComponent, step: string): void {
    for (const group of dockview.groups) {
        if (group.api.isVisible === false) {
            continue;
        }
        const content = group.element.querySelector('.dv-content-container')!;
        const active = group.activePanel;
        for (const panel of group.panels) {
            const el = panel.view.content.element;
            const where = `${step}: ${panel.id} (${panel.api.renderer}, active=${active?.id})`;
            const balance = counts[panel.id].show - counts[panel.id].hide;
            if (panel === active) {
                expect([where, panel.api.isVisible]).toEqual([where, true]);
                if (panel.api.renderer === 'onlyWhenVisible') {
                    expect([where, content.contains(el), balance]).toEqual([
                        where,
                        true,
                        1,
                    ]);
                } else {
                    expect([where, !!el.closest('.dv-render-overlay')]).toEqual(
                        [where, true]
                    );
                }
            } else {
                expect([
                    where,
                    panel.api.isVisible,
                    content.contains(el),
                ]).toEqual([where, false, false]);
                if (panel.api.renderer === 'onlyWhenVisible') {
                    expect([where, el.parentElement, balance]).toEqual([
                        where,
                        null,
                        0,
                    ]);
                } else {
                    expect([where, !!el.closest('.dv-render-overlay')]).toEqual(
                        [where, true]
                    );
                }
            }
        }
    }
}

function layoutJSON(
    views: string[],
    activeView: string,
    renderers: Record<string, DockviewPanelRenderer | undefined>
) {
    const panels: Record<string, unknown> = {};
    for (const id of views) {
        panels[id] = {
            id,
            contentComponent: 'default',
            title: id,
            renderer: renderers[id],
        };
    }
    return {
        activeGroup: 'g',
        grid: {
            root: {
                type: 'branch',
                data: [
                    {
                        type: 'leaf',
                        data: { views, id: 'g', activeView },
                        size: 1000,
                    },
                ],
                size: 1000,
            },
            height: 1000,
            width: 1000,
            orientation: Orientation.HORIZONTAL,
        },
        panels,
    } as any;
}

/** Switch to each other panel and back, then close them, checking throughout. */
function cycle(dockview: DockviewComponent, step: string): void {
    const a = dockview.getGroupPanel('a')!;
    const others = a.api.group.panels.filter((panel) => panel !== a);
    for (const other of others) {
        other.api.setActive();
        check(dockview, `${step} > activate ${other.id}`);
    }
    a.api.setActive();
    check(dockview, `${step} > re-activate a`);
    for (const other of others) {
        other.api.close();
        check(dockview, `${step} > close ${other.id}`);
    }
}

const RENDERERS: DockviewPanelRenderer[] = ['onlyWhenVisible', 'always'];

describe.each(RENDERERS)('active %s', (ra) => {
    describe.each(RENDERERS)('inactive %s', (rb) => {
        const renderers = { a: ra, b: rb, c: rb };
        const inactive = (id: string, position: Record<string, unknown>) => ({
            id,
            component: 'default',
            renderer: rb,
            inactive: true,
            position,
        });

        test('fromJSON, active first', () => {
            const dockview = create();
            dockview.fromJSON(layoutJSON(['a', 'b'], 'a', renderers));
            check(dockview, 'fromJSON');
            cycle(dockview, 'fromJSON');
        });

        test('fromJSON, inactive first', () => {
            const dockview = create();
            dockview.fromJSON(layoutJSON(['b', 'a'], 'a', renderers));
            check(dockview, 'fromJSON');
            cycle(dockview, 'fromJSON');
        });

        test('fromJSON, inactive on both sides', () => {
            const dockview = create();
            dockview.fromJSON(layoutJSON(['b', 'a', 'c'], 'a', renderers));
            check(dockview, 'fromJSON');
            cycle(dockview, 'fromJSON');
        });

        test('fromJSON over a live layout, with and without reuseExistingPanels', () => {
            const dockview = create();
            dockview.fromJSON(layoutJSON(['a', 'b', 'c'], 'a', renderers));
            dockview.fromJSON(dockview.toJSON());
            check(dockview, 'again');
            dockview.fromJSON(dockview.toJSON(), { reuseExistingPanels: true });
            check(dockview, 'reuse');
            cycle(dockview, 'reuse');
        });

        test('fromJSON with defaultRenderer', () => {
            const dockview = create(rb);
            dockview.fromJSON(
                layoutJSON(['a', 'b'], 'a', { a: ra, b: undefined })
            );
            check(dockview, 'defaultRenderer');
            cycle(dockview, 'defaultRenderer');
        });

        test('addPanel inactive', () => {
            const dockview = create();
            dockview.addPanel({ id: 'a', component: 'default', renderer: ra });
            dockview.addPanel(
                inactive('b', { referencePanel: 'a', direction: 'within' })
            );
            check(dockview, 'add b');
            dockview.addPanel(
                inactive('c', { referencePanel: 'a', direction: 'within' })
            );
            check(dockview, 'add c');
            cycle(dockview, 'add');
        });

        test('moveGroupOrPanel skipSetActive', () => {
            const dockview = create();
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
                renderer: ra,
            });
            const b = dockview.addPanel({
                id: 'b',
                component: 'default',
                renderer: rb,
                position: { direction: 'right' },
            });
            dockview.addPanel({
                id: 'c',
                component: 'default',
                renderer: rb,
                position: { referencePanel: 'b', direction: 'within' },
            });
            a.api.setActive();
            dockview.moveGroupOrPanel({
                from: { groupId: b.api.group.id, panelId: 'b' },
                to: { group: a.api.group, position: 'center' },
                skipSetActive: true,
            });
            check(dockview, 'move');
            cycle(dockview, 'move');
        });

        test('setRenderer on inactive and active panels', () => {
            const dockview = create();
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
                renderer: ra,
            });
            const b = dockview.addPanel({
                id: 'b',
                component: 'default',
                renderer: rb,
                position: { referencePanel: 'a', direction: 'within' },
            });
            a.api.setActive();
            const flip = (r: DockviewPanelRenderer) =>
                r === 'always' ? 'onlyWhenVisible' : 'always';
            b.api.setRenderer(flip(rb));
            check(dockview, 'flip b');
            b.api.setRenderer(rb);
            check(dockview, 'restore b');
            a.api.setRenderer(flip(ra));
            check(dockview, 'flip a');
            a.api.setRenderer(ra);
            check(dockview, 'restore a');
            cycle(dockview, 'setRenderer');
        });

        test('render container swap', () => {
            const dockview = create();
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
                renderer: ra,
            });
            dockview.addPanel(
                inactive('b', { referencePanel: 'a', direction: 'within' })
            );
            const host = document.createElement('div');
            dockview.element.appendChild(host);
            const before = counts.a.show;
            a.api.group.model.renderContainer = new OverlayRenderContainer(
                host,
                dockview
            );
            check(dockview, 'swap');
            if (ra === 'onlyWhenVisible') {
                expect(counts.a.show - before).toBe(1);
            }
            a.api.group.model.renderContainer = null;
            check(dockview, 'swap back');
            cycle(dockview, 'swap');
        });

        test('floating group round-trip', () => {
            const dockview = create();
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
                renderer: ra,
            });
            dockview.addPanel(
                inactive('b', { referencePanel: 'a', direction: 'within' })
            );
            dockview.addFloatingGroup(a.api.group);
            check(dockview, 'floating');
            dockview.fromJSON(dockview.toJSON());
            check(dockview, 'floating restored');
            cycle(dockview, 'floating');
        });

        test('edge group hide/show, auto-hide/pin and round-trips', () => {
            const dockview = create();
            dockview.addPanel({ id: 'main', component: 'default' });
            dockview.addEdgeGroup('left', {
                id: 'edge-left',
                initialSize: 200,
            });
            dockview.addPanel({
                id: 'a',
                component: 'default',
                renderer: ra,
                position: { referenceGroup: 'edge-left', direction: 'within' },
            });
            dockview.addPanel(
                inactive('b', {
                    referenceGroup: 'edge-left',
                    direction: 'within',
                })
            );
            dockview.addPanel(
                inactive('c', {
                    referenceGroup: 'edge-left',
                    direction: 'within',
                })
            );
            check(dockview, 'edge');
            dockview.setEdgeGroupVisible('left', false);
            dockview.setEdgeGroupVisible('left', true);
            check(dockview, 'edge hide/show');
            dockview.fromJSON(dockview.toJSON());
            dockview.setEdgeGroupVisible('left', true);
            check(dockview, 'edge fromJSON');
            dockview.autoHideEdgeGroup('left');
            dockview.pinEdgeGroup('left');
            check(dockview, 'edge auto-hide/pin');
            dockview.fromJSON(dockview.toJSON(), { reuseExistingPanels: true });
            dockview.setEdgeGroupVisible('left', true);
            check(dockview, 'edge reuse');
            cycle(dockview, 'edge');
        });

        test('tab groups collapsed around inactive and active panels, and round-trip', () => {
            const dockview = create();
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
                renderer: ra,
            });
            dockview.addPanel(
                inactive('b', { referencePanel: 'a', direction: 'within' })
            );
            dockview.addPanel(
                inactive('c', { referencePanel: 'a', direction: 'within' })
            );
            const model = a.api.group.model;

            const inactiveGroup = model.createTabGroup({
                label: 'inactive',
                color: 'red',
            });
            model.addPanelToTabGroup(inactiveGroup.id, 'b');
            model.addPanelToTabGroup(inactiveGroup.id, 'c');
            inactiveGroup.collapse();
            check(dockview, 'inactive collapsed');
            inactiveGroup.expand();
            check(dockview, 'inactive expanded');

            const activeGroup = model.createTabGroup({
                label: 'active',
                color: 'blue',
            });
            model.addPanelToTabGroup(activeGroup.id, 'a');
            activeGroup.collapse();
            check(dockview, 'active collapsed');
            activeGroup.expand();
            a.api.setActive();
            check(dockview, 'active expanded');

            inactiveGroup.collapse();
            dockview.fromJSON(dockview.toJSON());
            check(dockview, 'collapsed fromJSON');
            for (const tabGroup of dockview
                .getGroupPanel('a')!
                .api.group.model.getTabGroups()) {
                tabGroup.expand();
            }
            check(dockview, 'expanded fromJSON');
            cycle(dockview, 'tab groups');
        });
    });
});
