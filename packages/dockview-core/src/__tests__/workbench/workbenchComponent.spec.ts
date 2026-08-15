import type { IContentRenderer } from '../../dockview/types';
import type { GridviewComponent } from '../../gridview/gridviewComponent';
import { GridviewPanel } from '../../gridview/gridviewPanel';
import type { IFrameworkPart, PanelUpdateEvent } from '../../panel/types';
import {
    type ActivityBarPosition,
    DEFAULT_ACTIVITY_BAR_SIZE,
    DEFAULT_HEADER_SIZE,
    DEFAULT_STATUS_BAR_SIZE,
    type PanelAlignment,
    type PanelPosition,
    type SideBarPosition,
    WORKBENCH_IDS,
} from '../../workbench/options';
import { WorkbenchComponent } from '../../workbench/workbenchComponent';

/** A minimal chrome-band panel for the outer gridview. */
class TestBand extends GridviewPanel {
    constructor(id: string, component: string) {
        super(id, component);
        this.element.className = `test-band-${component}`;
        this.api.initialize(this);
    }

    getComponent(): IFrameworkPart {
        return {
            update: () => {
                //
            },
            dispose: () => {
                //
            },
        };
    }
}

/** A minimal dockview content renderer for the embedded editor. */
class TestEditorPanel implements IContentRenderer {
    element: HTMLElement = document.createElement('div');

    constructor(
        public readonly id: string,
        public readonly component: string
    ) {}

    init(): void {
        //
    }
    layout(): void {
        //
    }
    update(_event: PanelUpdateEvent): void {
        //
    }
    toJSON(): object {
        return { id: this.component };
    }
    focus(): void {
        //
    }
    dispose(): void {
        //
    }
}

function createWorkbench(
    container: HTMLElement,
    opts: {
        header?: boolean;
        statusBar?: boolean;
        activityBar?: boolean;
        activityBarPosition?: ActivityBarPosition;
        primarySideBar?: boolean;
        secondarySideBar?: boolean;
        primarySideBarPosition?: SideBarPosition;
        panel?: {
            position?: PanelPosition;
            alignment?: PanelAlignment;
            size?: number;
            visible?: boolean;
        };
    } = {}
): WorkbenchComponent {
    return new WorkbenchComponent(container, {
        header: opts.header ? { component: 'header' } : undefined,
        statusBar: opts.statusBar ? { component: 'status' } : undefined,
        activityBar: opts.activityBar
            ? { component: 'activity', position: opts.activityBarPosition }
            : undefined,
        primarySideBar: opts.primarySideBar
            ? { component: 'primary' }
            : undefined,
        secondarySideBar: opts.secondarySideBar
            ? { component: 'secondary' }
            : undefined,
        panel: opts.panel ? { component: 'panel', ...opts.panel } : undefined,
        primarySideBarPosition: opts.primarySideBarPosition,
        createComponent: (options) => new TestBand(options.id, options.name),
        dockview: {
            createComponent: (options) =>
                new TestEditorPanel(options.id, options.name),
        },
    });
}

/** True when `a` appears before `b` in document order (a is left of b). */
function precedes(a: Element, b: Element): boolean {
    return Boolean(
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    );
}

function regionEl(root: Element, name: string): Element {
    const el =
        name === 'editor'
            ? root.querySelector('.dv-workbench-editor')
            : root.querySelector(`.test-band-${name}`);
    if (!el) {
        throw new Error(`region element not found: ${name}`);
    }
    return el;
}

describe('WorkbenchComponent', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    test('mounts a root element into the container', () => {
        const workbench = createWorkbench(container);
        workbench.layout(1000, 800);

        expect(container.querySelector('.dv-workbench')).toBeTruthy();

        workbench.dispose();
    });

    test('exposes a working dockview editor api', () => {
        const workbench = createWorkbench(container);
        workbench.layout(1000, 800);

        const panel = workbench.dockview.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        expect(panel.id).toBe('panel_1');
        expect(workbench.dockview.panels.length).toBe(1);

        workbench.dispose();
    });

    test('editor is always present; bands are opt-in', () => {
        const workbench = createWorkbench(container);
        workbench.layout(1000, 800);

        // no header/status requested
        expect(workbench.isBandVisible('header')).toBe(false);
        expect(workbench.isBandVisible('statusBar')).toBe(false);

        workbench.dispose();
    });

    test('header + status bar are added when requested', () => {
        const workbench = createWorkbench(container, {
            header: true,
            statusBar: true,
        });
        workbench.layout(1000, 800);

        expect(container.querySelector('.test-band-header')).toBeTruthy();
        expect(container.querySelector('.test-band-status')).toBeTruthy();

        expect(workbench.isBandVisible('header')).toBe(true);
        expect(workbench.isBandVisible('statusBar')).toBe(true);

        workbench.dispose();
    });

    test('fixed bands lock minimumHeight === maximumHeight', () => {
        const workbench = createWorkbench(container, {
            header: true,
            statusBar: true,
        });
        workbench.layout(1000, 800);

        const grid = (workbench as unknown as { _gridview: GridviewComponent })
            ._gridview;
        const header = grid.getPanel(WORKBENCH_IDS.header) as GridviewPanel;
        const status = grid.getPanel(WORKBENCH_IDS.statusBar) as GridviewPanel;

        expect(header.minimumHeight).toBe(DEFAULT_HEADER_SIZE);
        expect(header.maximumHeight).toBe(DEFAULT_HEADER_SIZE);
        expect(status.minimumHeight).toBe(DEFAULT_STATUS_BAR_SIZE);
        expect(status.maximumHeight).toBe(DEFAULT_STATUS_BAR_SIZE);

        workbench.dispose();
    });

    test('band visibility can be toggled', () => {
        const workbench = createWorkbench(container, { header: true });
        workbench.layout(1000, 800);

        expect(workbench.isBandVisible('header')).toBe(true);
        workbench.setBandVisible('header', false);
        expect(workbench.isBandVisible('header')).toBe(false);
        workbench.setBandVisible('header', true);
        expect(workbench.isBandVisible('header')).toBe(true);

        workbench.dispose();
    });

    test('a band can start hidden', () => {
        const workbench = new WorkbenchComponent(container, {
            header: { component: 'header', visible: false },
            createComponent: (options) =>
                new TestBand(options.id, options.name),
            dockview: {
                createComponent: (options) =>
                    new TestEditorPanel(options.id, options.name),
            },
        });
        workbench.layout(1000, 800);

        expect(workbench.isBandVisible('header')).toBe(false);

        workbench.dispose();
    });

    test('round-trips through toJSON / fromJSON, preserving editor panels', () => {
        const workbench = createWorkbench(container, {
            header: true,
            statusBar: true,
        });
        workbench.layout(1000, 800);

        workbench.dockview.addPanel({ id: 'panel_1', component: 'default' });
        workbench.dockview.addPanel({ id: 'panel_2', component: 'default' });

        const state = workbench.toJSON();
        expect(state.dockview).toBeDefined();

        const restored = createWorkbench(container, {
            header: true,
            statusBar: true,
        });
        restored.layout(1000, 800);
        restored.fromJSON(state);

        expect(restored.dockview.panels.map((p) => p.id).sort()).toEqual([
            'panel_1',
            'panel_2',
        ]);
        expect(restored.isBandVisible('header')).toBe(true);
        expect(restored.isBandVisible('statusBar')).toBe(true);

        restored.dispose();
        workbench.dispose();
    });

    test('dispose removes the root element', () => {
        const workbench = createWorkbench(container);
        workbench.layout(1000, 800);
        expect(container.querySelector('.dv-workbench')).toBeTruthy();

        workbench.dispose();
        expect(container.querySelector('.dv-workbench')).toBeFalsy();
    });

    describe('side regions', () => {
        test('activity bar, primary and secondary side bars are added', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
            });
            workbench.layout(1000, 800);

            expect(workbench.isRegionVisible('activityBar')).toBe(true);
            expect(workbench.isRegionVisible('primarySideBar')).toBe(true);
            expect(workbench.isRegionVisible('secondarySideBar')).toBe(true);

            workbench.dispose();
        });

        test('default left layout: activity | primary | editor | secondary', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
            });
            workbench.layout(1000, 800);

            const activity = regionEl(workbench.element, 'activity');
            const primary = regionEl(workbench.element, 'primary');
            const editor = regionEl(workbench.element, 'editor');
            const secondary = regionEl(workbench.element, 'secondary');

            expect(precedes(activity, primary)).toBe(true);
            expect(precedes(primary, editor)).toBe(true);
            expect(precedes(editor, secondary)).toBe(true);
            expect(workbench.primarySideBarPosition).toBe('left');

            workbench.dispose();
        });

        test('primarySideBarPosition: right mirrors the layout', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                primarySideBarPosition: 'right',
            });
            workbench.layout(1000, 800);

            const activity = regionEl(workbench.element, 'activity');
            const primary = regionEl(workbench.element, 'primary');
            const editor = regionEl(workbench.element, 'editor');
            const secondary = regionEl(workbench.element, 'secondary');

            // secondary | editor | primary | activity
            expect(precedes(secondary, editor)).toBe(true);
            expect(precedes(editor, primary)).toBe(true);
            expect(precedes(primary, activity)).toBe(true);

            workbench.dispose();
        });

        test('setPrimarySideBarPosition flips the side bars', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
            });
            workbench.layout(1000, 800);

            expect(workbench.primarySideBarPosition).toBe('left');
            expect(
                precedes(
                    regionEl(workbench.element, 'primary'),
                    regionEl(workbench.element, 'editor')
                )
            ).toBe(true);

            workbench.setPrimarySideBarPosition('right');

            expect(workbench.primarySideBarPosition).toBe('right');
            // now primary is to the right of the editor, activity outside it
            expect(
                precedes(
                    regionEl(workbench.element, 'editor'),
                    regionEl(workbench.element, 'primary')
                )
            ).toBe(true);
            expect(
                precedes(
                    regionEl(workbench.element, 'primary'),
                    regionEl(workbench.element, 'activity')
                )
            ).toBe(true);
            // secondary flipped to the left of the editor
            expect(
                precedes(
                    regionEl(workbench.element, 'secondary'),
                    regionEl(workbench.element, 'editor')
                )
            ).toBe(true);

            workbench.dispose();
        });

        test('flipping is a no-op when already on that side', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            workbench.setPrimarySideBarPosition('left');
            expect(workbench.primarySideBarPosition).toBe('left');

            workbench.dispose();
        });

        test('activity bar is fixed width (minimum === maximum)', () => {
            const workbench = createWorkbench(container, { activityBar: true });
            workbench.layout(1000, 800);

            const grid = (
                workbench as unknown as { _gridview: GridviewComponent }
            )._gridview;
            const rail = grid.getPanel(
                WORKBENCH_IDS.activityBar
            ) as GridviewPanel;

            expect(rail.minimumWidth).toBe(DEFAULT_ACTIVITY_BAR_SIZE);
            expect(rail.maximumWidth).toBe(DEFAULT_ACTIVITY_BAR_SIZE);

            workbench.dispose();
        });

        test('side bar visibility toggles', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
                secondarySideBar: true,
            });
            workbench.layout(1000, 800);

            expect(workbench.isRegionVisible('primarySideBar')).toBe(true);
            workbench.setRegionVisible('primarySideBar', false);
            expect(workbench.isRegionVisible('primarySideBar')).toBe(false);
            workbench.setRegionVisible('primarySideBar', true);
            expect(workbench.isRegionVisible('primarySideBar')).toBe(true);

            workbench.dispose();
        });

        test('a side bar can start hidden', () => {
            const workbench = new WorkbenchComponent(container, {
                secondarySideBar: { component: 'secondary', visible: false },
                createComponent: (options) =>
                    new TestBand(options.id, options.name),
                dockview: {
                    createComponent: (options) =>
                        new TestEditorPanel(options.id, options.name),
                },
            });
            workbench.layout(1000, 800);

            expect(workbench.isRegionVisible('secondarySideBar')).toBe(false);

            workbench.dispose();
        });

        test('primary side bar position round-trips through serialization', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
            });
            workbench.layout(1000, 800);
            workbench.setPrimarySideBarPosition('right');

            const state = workbench.toJSON();
            expect(state.primarySideBarPosition).toBe('right');

            const restored = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
            });
            restored.layout(1000, 800);
            restored.fromJSON(state);

            expect(restored.primarySideBarPosition).toBe('right');
            // restored tree keeps the mirrored order
            expect(
                precedes(
                    regionEl(restored.element, 'editor'),
                    regionEl(restored.element, 'primary')
                )
            ).toBe(true);

            restored.dispose();
            workbench.dispose();
        });
    });

    describe('activity bar position', () => {
        const railOf = (workbench: WorkbenchComponent): GridviewPanel =>
            (
                workbench as unknown as { _gridview: GridviewComponent }
            )._gridview.getPanel(WORKBENCH_IDS.activityBar) as GridviewPanel;

        test('top: fixed-height strip stacked above the primary side bar', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                activityBarPosition: 'top',
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            expect(workbench.activityBarPosition).toBe('top');

            const rail = railOf(workbench);
            // fixed height, not fixed width
            expect(rail.minimumHeight).toBe(DEFAULT_ACTIVITY_BAR_SIZE);
            expect(rail.maximumHeight).toBe(DEFAULT_ACTIVITY_BAR_SIZE);
            expect(rail.maximumWidth).toBeGreaterThan(DEFAULT_ACTIVITY_BAR_SIZE);

            const activity = regionEl(workbench.element, 'activity');
            const primary = regionEl(workbench.element, 'primary');
            const editor = regionEl(workbench.element, 'editor');
            // stacked above the primary, both left of the editor
            expect(precedes(activity, primary)).toBe(true);
            expect(precedes(primary, editor)).toBe(true);

            workbench.dispose();
        });

        test('bottom: fixed-height strip stacked below the primary side bar', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                activityBarPosition: 'bottom',
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            const rail = railOf(workbench);
            expect(rail.minimumHeight).toBe(DEFAULT_ACTIVITY_BAR_SIZE);
            expect(rail.maximumHeight).toBe(DEFAULT_ACTIVITY_BAR_SIZE);

            const activity = regionEl(workbench.element, 'activity');
            const primary = regionEl(workbench.element, 'primary');
            const editor = regionEl(workbench.element, 'editor');
            // primary above the strip, both left of the editor
            expect(precedes(primary, activity)).toBe(true);
            expect(precedes(activity, editor)).toBe(true);

            workbench.dispose();
        });

        test('setActivityBarPosition switches a rail to a top strip at runtime', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            // starts as a fixed-width rail
            expect(workbench.activityBarPosition).toBe('default');
            expect(railOf(workbench).maximumWidth).toBe(DEFAULT_ACTIVITY_BAR_SIZE);

            workbench.setActivityBarPosition('top');

            expect(workbench.activityBarPosition).toBe('top');
            const rail = railOf(workbench);
            expect(rail.maximumHeight).toBe(DEFAULT_ACTIVITY_BAR_SIZE);
            expect(
                precedes(
                    regionEl(workbench.element, 'activity'),
                    regionEl(workbench.element, 'primary')
                )
            ).toBe(true);

            workbench.dispose();
        });

        test('position round-trips through serialization', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                activityBarPosition: 'top',
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            const state = workbench.toJSON();
            expect(state.activityBarPosition).toBe('top');

            const restored = createWorkbench(container, {
                activityBar: true,
                activityBarPosition: 'top',
                primarySideBar: true,
            });
            restored.layout(1000, 800);
            restored.fromJSON(state);

            expect(restored.activityBarPosition).toBe('top');
            expect(railOf(restored).maximumHeight).toBe(DEFAULT_ACTIVITY_BAR_SIZE);

            restored.dispose();
            workbench.dispose();
        });

        test('flips cleanly with a top activity bar, staying stacked', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                activityBarPosition: 'top',
                primarySideBar: true,
                secondarySideBar: true,
            });
            workbench.layout(1000, 800);

            workbench.setPrimarySideBarPosition('right');

            expect(workbench.primarySideBarPosition).toBe('right');
            const activity = regionEl(workbench.element, 'activity');
            const primary = regionEl(workbench.element, 'primary');
            const editor = regionEl(workbench.element, 'editor');
            // sidebar column now right of the editor, strip still stacked above
            expect(precedes(editor, activity)).toBe(true);
            expect(precedes(activity, primary)).toBe(true);
            // still a fixed-height strip after the flip
            expect(railOf(workbench).maximumHeight).toBe(
                DEFAULT_ACTIVITY_BAR_SIZE
            );

            workbench.dispose();
        });

        test.each([
            ['center', { position: 'bottom', alignment: 'center' }],
            ['justify', { position: 'bottom', alignment: 'justify' }],
            ['left-aligned', { position: 'bottom', alignment: 'left' }],
        ] as const)(
            'a top activity bar coexists with a %s panel',
            (_name, panel) => {
                const workbench = createWorkbench(container, {
                    activityBar: true,
                    activityBarPosition: 'top',
                    primarySideBar: true,
                    secondarySideBar: true,
                    panel: panel as {
                        position?: PanelPosition;
                        alignment?: PanelAlignment;
                    },
                });
                workbench.layout(1000, 800);

                expect(workbench.isRegionVisible('panel')).toBe(true);
                expect(railOf(workbench).maximumHeight).toBe(
                    DEFAULT_ACTIVITY_BAR_SIZE
                );

                // and it still flips without throwing
                workbench.setPrimarySideBarPosition('right');
                expect(workbench.primarySideBarPosition).toBe('right');
                expect(workbench.isRegionVisible('panel')).toBe(true);

                workbench.dispose();
            }
        );
    });

    describe('flipping with a tool panel', () => {
        // The flat body-row reversal cannot express a flip while the panel is
        // in the body, so those cases rebuild. Assert the flip still produces
        // the mirrored bar order and keeps the panel present in every panel
        // configuration.
        const barsAreFlipped = (workbench: WorkbenchComponent): void => {
            const editor = regionEl(workbench.element, 'editor');
            const primary = regionEl(workbench.element, 'primary');
            const activity = regionEl(workbench.element, 'activity');
            const secondary = regionEl(workbench.element, 'secondary');
            // right layout: secondary | editor | primary | activity
            expect(precedes(secondary, editor)).toBe(true);
            expect(precedes(editor, primary)).toBe(true);
            expect(precedes(primary, activity)).toBe(true);
        };

        const allBars = {
            activityBar: true,
            primarySideBar: true,
            secondarySideBar: true,
        } as const;

        test.each([
            ['center', { position: 'bottom', alignment: 'center' }],
            ['left-aligned', { position: 'bottom', alignment: 'left' }],
            ['right-aligned', { position: 'bottom', alignment: 'right' }],
            ['justify', { position: 'bottom', alignment: 'justify' }],
            ['left position', { position: 'left' }],
            ['right position', { position: 'right' }],
        ] as const)(
            'flips cleanly with a %s panel, panel preserved',
            (_name, panel) => {
                const workbench = createWorkbench(container, {
                    ...allBars,
                    panel: panel as {
                        position?: PanelPosition;
                        alignment?: PanelAlignment;
                    },
                });
                workbench.layout(1000, 800);

                expect(workbench.isRegionVisible('panel')).toBe(true);

                workbench.setPrimarySideBarPosition('right');

                expect(workbench.primarySideBarPosition).toBe('right');
                barsAreFlipped(workbench);
                // the panel survives the flip in every configuration
                expect(workbench.isRegionVisible('panel')).toBe(true);
                expect(regionEl(workbench.element, 'panel')).toBeTruthy();

                workbench.dispose();
            }
        );

        test('a hidden panel stays hidden across a flip', () => {
            const workbench = createWorkbench(container, {
                ...allBars,
                panel: { position: 'bottom', alignment: 'center' },
            });
            workbench.layout(1000, 800);

            workbench.setRegionVisible('panel', false);
            expect(workbench.isRegionVisible('panel')).toBe(false);

            workbench.setPrimarySideBarPosition('right');

            barsAreFlipped(workbench);
            expect(workbench.isRegionVisible('panel')).toBe(false);

            workbench.dispose();
        });

        test('flip then flip back restores the left layout with a panel', () => {
            const workbench = createWorkbench(container, {
                ...allBars,
                panel: { position: 'bottom', alignment: 'left' },
            });
            workbench.layout(1000, 800);

            workbench.setPrimarySideBarPosition('right');
            workbench.setPrimarySideBarPosition('left');

            expect(workbench.primarySideBarPosition).toBe('left');
            // back to: activity | primary | editor | secondary
            const activity = regionEl(workbench.element, 'activity');
            const primary = regionEl(workbench.element, 'primary');
            const editor = regionEl(workbench.element, 'editor');
            const secondary = regionEl(workbench.element, 'secondary');
            expect(precedes(activity, primary)).toBe(true);
            expect(precedes(primary, editor)).toBe(true);
            expect(precedes(editor, secondary)).toBe(true);
            expect(workbench.isRegionVisible('panel')).toBe(true);

            workbench.dispose();
        });
    });

    describe('tool panel', () => {
        const gridOf = (workbench: WorkbenchComponent): GridviewComponent =>
            (workbench as unknown as { _gridview: GridviewComponent })
                ._gridview;
        const panelOf = (workbench: WorkbenchComponent): GridviewPanel =>
            gridOf(workbench).getPanel(WORKBENCH_IDS.panel) as GridviewPanel;
        const editorOf = (workbench: WorkbenchComponent): GridviewPanel =>
            gridOf(workbench).getPanel(WORKBENCH_IDS.editor) as GridviewPanel;

        test('is added at the bottom, centred, by default', () => {
            const workbench = createWorkbench(container, { panel: {} });
            workbench.layout(1000, 800);

            expect(workbench.isRegionVisible('panel')).toBe(true);
            expect(workbench.panelPosition).toBe('bottom');
            expect(workbench.panelAlignment).toBe('center');

            workbench.dispose();
        });

        test('centre alignment spans the editor column only', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: { alignment: 'center' },
            });
            workbench.layout(1000, 800);

            // panel sits below the editor in the same column
            expect(panelOf(workbench).width).toBe(editorOf(workbench).width);
            // ... which is narrower than the whole workbench (side bars beside it)
            expect(panelOf(workbench).width).toBeLessThan(1000);

            workbench.dispose();
        });

        test('justify alignment spans the full width past the side bars', () => {
            const workbench = createWorkbench(container, {
                header: true,
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: { alignment: 'justify' },
            });
            workbench.layout(1000, 800);

            expect(panelOf(workbench).width).toBeGreaterThan(
                editorOf(workbench).width
            );
            expect(panelOf(workbench).width).toBe(1000);

            workbench.dispose();
        });

        const barOf = (
            workbench: WorkbenchComponent,
            id: string
        ): GridviewPanel => gridOf(workbench).getPanel(id) as GridviewPanel;

        test('left alignment spans the editor + left bars, not the right bar', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: { alignment: 'left' },
            });
            workbench.layout(1000, 800);

            const panel = panelOf(workbench);
            const editor = editorOf(workbench);
            const primary = barOf(workbench, WORKBENCH_IDS.primarySideBar);
            const secondary = barOf(workbench, WORKBENCH_IDS.secondarySideBar);

            // spans wider than the editor, but not the whole width (secondary excluded)
            expect(panel.width).toBeGreaterThan(editor.width);
            expect(panel.width).toBeLessThan(1000);
            // the left primary bar shares the editor row (panel below it)
            expect(primary.height).toBe(editor.height);
            // the excluded right bar runs full height, past the panel
            expect(secondary.height).toBeGreaterThan(editor.height);

            workbench.dispose();
        });

        test('right alignment spans the editor + right bar, not the left bars', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: { alignment: 'right' },
            });
            workbench.layout(1000, 800);

            const panel = panelOf(workbench);
            const editor = editorOf(workbench);
            const primary = barOf(workbench, WORKBENCH_IDS.primarySideBar);
            const secondary = barOf(workbench, WORKBENCH_IDS.secondarySideBar);

            expect(panel.width).toBeGreaterThan(editor.width);
            expect(panel.width).toBeLessThan(1000);
            // the right (secondary) bar shares the editor row
            expect(secondary.height).toBe(editor.height);
            // the excluded left (primary) bar runs full height, past the panel
            expect(primary.height).toBeGreaterThan(editor.height);

            workbench.dispose();
        });

        test('switching left -> center -> justify re-nests correctly', () => {
            const workbench = createWorkbench(container, {
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: { alignment: 'center' },
            });
            workbench.layout(1000, 800);

            expect(panelOf(workbench).width).toBe(editorOf(workbench).width);

            workbench.setPanelAlignment('left');
            expect(workbench.panelAlignment).toBe('left');
            expect(panelOf(workbench).width).toBeGreaterThan(
                editorOf(workbench).width
            );
            expect(panelOf(workbench).width).toBeLessThan(1000);

            // back to center: the pulled-in bars are un-nested again
            workbench.setPanelAlignment('center');
            expect(panelOf(workbench).width).toBe(editorOf(workbench).width);

            // and out to full width
            workbench.setPanelAlignment('justify');
            expect(panelOf(workbench).width).toBe(1000);

            workbench.dispose();
        });

        test('position top places the panel above the editor', () => {
            const workbench = createWorkbench(container, {
                panel: { position: 'top' },
            });
            workbench.layout(1000, 800);

            expect(
                precedes(
                    regionEl(workbench.element, 'panel'),
                    regionEl(workbench.element, 'editor')
                )
            ).toBe(true);
            // same column => same width
            expect(panelOf(workbench).width).toBe(editorOf(workbench).width);

            workbench.dispose();
        });

        test('position right places the panel beside the editor', () => {
            const workbench = createWorkbench(container, {
                panel: { position: 'right' },
            });
            workbench.layout(1000, 800);

            expect(
                precedes(
                    regionEl(workbench.element, 'editor'),
                    regionEl(workbench.element, 'panel')
                )
            ).toBe(true);
            // same row => same height
            expect(panelOf(workbench).height).toBe(editorOf(workbench).height);

            workbench.dispose();
        });

        test('setPanelAlignment switches centre <-> justify', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
                secondarySideBar: true,
                panel: { alignment: 'center' },
            });
            workbench.layout(1000, 800);

            expect(panelOf(workbench).width).toBe(editorOf(workbench).width);

            workbench.setPanelAlignment('justify');

            expect(workbench.panelAlignment).toBe('justify');
            expect(panelOf(workbench).width).toBeGreaterThan(
                editorOf(workbench).width
            );

            workbench.dispose();
        });

        test('setPanelPosition moves the panel to the side', () => {
            const workbench = createWorkbench(container, {
                panel: { position: 'bottom' },
            });
            workbench.layout(1000, 800);

            workbench.setPanelPosition('left');

            expect(workbench.panelPosition).toBe('left');
            expect(
                precedes(
                    regionEl(workbench.element, 'panel'),
                    regionEl(workbench.element, 'editor')
                )
            ).toBe(true);
            expect(panelOf(workbench).height).toBe(editorOf(workbench).height);

            workbench.dispose();
        });

        test('panel visibility toggles', () => {
            const workbench = createWorkbench(container, { panel: {} });
            workbench.layout(1000, 800);

            expect(workbench.isRegionVisible('panel')).toBe(true);
            workbench.setRegionVisible('panel', false);
            expect(workbench.isRegionVisible('panel')).toBe(false);
            workbench.setRegionVisible('panel', true);
            expect(workbench.isRegionVisible('panel')).toBe(true);

            workbench.dispose();
        });

        test('panel position + alignment round-trip through serialization', () => {
            const workbench = createWorkbench(container, {
                header: true,
                primarySideBar: true,
                panel: { position: 'bottom', alignment: 'justify' },
            });
            workbench.layout(1000, 800);

            const state = workbench.toJSON();
            expect(state.panelPosition).toBe('bottom');
            expect(state.panelAlignment).toBe('justify');

            const restored = createWorkbench(container, {
                header: true,
                primarySideBar: true,
                panel: { position: 'bottom', alignment: 'justify' },
            });
            restored.layout(1000, 800);
            restored.fromJSON(state);

            expect(restored.panelPosition).toBe('bottom');
            expect(restored.panelAlignment).toBe('justify');
            // justify preserved: panel spans wider than the editor
            const rGrid = (
                restored as unknown as { _gridview: GridviewComponent }
            )._gridview;
            const rPanel = rGrid.getPanel(WORKBENCH_IDS.panel) as GridviewPanel;
            const rEditor = rGrid.getPanel(
                WORKBENCH_IDS.editor
            ) as GridviewPanel;
            expect(rPanel.width).toBeGreaterThan(rEditor.width);

            restored.dispose();
            workbench.dispose();
        });
    });

    describe('theming', () => {
        test('tags each region element with theme classes', () => {
            const workbench = createWorkbench(container, {
                header: true,
                statusBar: true,
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: {},
            });
            workbench.layout(1000, 800);

            const grid = (
                workbench as unknown as { _gridview: GridviewComponent }
            )._gridview;
            const cls = (id: string): DOMTokenList =>
                (grid.getPanel(id) as GridviewPanel).element.classList;

            expect(
                cls(WORKBENCH_IDS.header).contains('dv-workbench-header')
            ).toBe(true);
            expect(
                cls(WORKBENCH_IDS.activityBar).contains(
                    'dv-workbench-activity-bar'
                )
            ).toBe(true);
            expect(
                cls(WORKBENCH_IDS.primarySideBar).contains(
                    'dv-workbench-primary-side-bar'
                )
            ).toBe(true);
            expect(
                cls(WORKBENCH_IDS.panel).contains('dv-workbench-panel')
            ).toBe(true);
            // every region also carries the shared marker class
            expect(
                cls(WORKBENCH_IDS.secondarySideBar).contains(
                    'dv-workbench-region'
                )
            ).toBe(true);

            workbench.dispose();
        });

        test('region theme classes survive a toJSON / fromJSON round-trip', () => {
            const workbench = createWorkbench(container, {
                header: true,
                statusBar: true,
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: {},
            });
            workbench.layout(1000, 800);

            const state = workbench.toJSON();

            const restored = createWorkbench(container, {
                header: true,
                statusBar: true,
                activityBar: true,
                primarySideBar: true,
                secondarySideBar: true,
                panel: {},
            });
            restored.layout(1000, 800);
            restored.fromJSON(state);

            const grid = (
                restored as unknown as { _gridview: GridviewComponent }
            )._gridview;
            const cls = (id: string): DOMTokenList =>
                (grid.getPanel(id) as GridviewPanel).element.classList;

            for (const [id, className] of [
                [WORKBENCH_IDS.header, 'dv-workbench-header'],
                [WORKBENCH_IDS.statusBar, 'dv-workbench-status-bar'],
                [WORKBENCH_IDS.activityBar, 'dv-workbench-activity-bar'],
                [WORKBENCH_IDS.primarySideBar, 'dv-workbench-primary-side-bar'],
                [
                    WORKBENCH_IDS.secondarySideBar,
                    'dv-workbench-secondary-side-bar',
                ],
                [WORKBENCH_IDS.panel, 'dv-workbench-panel'],
            ] as const) {
                expect(cls(id).contains('dv-workbench-region')).toBe(true);
                expect(cls(id).contains(className)).toBe(true);
            }

            restored.dispose();
            workbench.dispose();
        });

        test('root element carries the dv-workbench class', () => {
            const workbench = createWorkbench(container, { header: true });
            workbench.layout(1000, 800);

            expect(workbench.element.classList.contains('dv-workbench')).toBe(
                true
            );

            workbench.dispose();
        });
    });

    describe('view containers', () => {
        test('setActiveViewContainer sets the active id and fires the event', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            const seen: (string | undefined)[] = [];
            const disposable = workbench.onDidChangeActiveViewContainer((id) =>
                seen.push(id)
            );

            workbench.setActiveViewContainer('search');

            expect(workbench.activeViewContainer).toBe('search');
            expect(seen).toEqual(['search']);

            disposable.dispose();
            workbench.dispose();
        });

        test('selecting a container reveals a hidden side bar', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            workbench.setRegionVisible('primarySideBar', false);
            workbench.setActiveViewContainer('search');

            expect(workbench.isRegionVisible('primarySideBar')).toBe(true);
            expect(workbench.activeViewContainer).toBe('search');

            workbench.dispose();
        });

        test('selecting the active container again toggles the side bar shut', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
            });
            workbench.layout(1000, 800);

            workbench.setActiveViewContainer('explorer');
            expect(workbench.isRegionVisible('primarySideBar')).toBe(true);

            workbench.setActiveViewContainer('explorer');
            expect(workbench.isRegionVisible('primarySideBar')).toBe(false);

            workbench.dispose();
        });

        test('active view container round-trips through serialization', () => {
            const workbench = createWorkbench(container, {
                primarySideBar: true,
            });
            workbench.layout(1000, 800);
            workbench.setActiveViewContainer('search');

            const state = workbench.toJSON();
            expect(state.activeViewContainer).toBe('search');

            const restored = createWorkbench(container, {
                primarySideBar: true,
            });
            restored.layout(1000, 800);
            restored.fromJSON(state);

            expect(restored.activeViewContainer).toBe('search');

            restored.dispose();
            workbench.dispose();
        });
    });
});
