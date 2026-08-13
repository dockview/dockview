import type { IContentRenderer } from '../../dockview/types';
import type { GridviewComponent } from '../../gridview/gridviewComponent';
import { GridviewPanel } from '../../gridview/gridviewPanel';
import type { IFrameworkPart, PanelUpdateEvent } from '../../panel/types';
import {
    DEFAULT_ACTIVITY_BAR_SIZE,
    DEFAULT_HEADER_SIZE,
    DEFAULT_STATUS_BAR_SIZE,
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
        toolbar?: boolean;
        statusBar?: boolean;
        activityBar?: boolean;
        primarySideBar?: boolean;
        secondarySideBar?: boolean;
        primarySideBarPosition?: SideBarPosition;
    } = {}
): WorkbenchComponent {
    return new WorkbenchComponent(container, {
        header: opts.header ? { component: 'header' } : undefined,
        toolbar: opts.toolbar ? { component: 'toolbar' } : undefined,
        statusBar: opts.statusBar ? { component: 'status' } : undefined,
        activityBar: opts.activityBar ? { component: 'activity' } : undefined,
        primarySideBar: opts.primarySideBar
            ? { component: 'primary' }
            : undefined,
        secondarySideBar: opts.secondarySideBar
            ? { component: 'secondary' }
            : undefined,
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

        // no header/toolbar/status requested
        expect(workbench.isBandVisible('header')).toBe(false);
        expect(workbench.isBandVisible('toolbar')).toBe(false);
        expect(workbench.isBandVisible('statusBar')).toBe(false);

        workbench.dispose();
    });

    test('header + toolbar + status bar are added when requested', () => {
        const workbench = createWorkbench(container, {
            header: true,
            toolbar: true,
            statusBar: true,
        });
        workbench.layout(1000, 800);

        expect(container.querySelector('.test-band-header')).toBeTruthy();
        expect(container.querySelector('.test-band-toolbar')).toBeTruthy();
        expect(container.querySelector('.test-band-status')).toBeTruthy();

        expect(workbench.isBandVisible('header')).toBe(true);
        expect(workbench.isBandVisible('toolbar')).toBe(true);
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
});
