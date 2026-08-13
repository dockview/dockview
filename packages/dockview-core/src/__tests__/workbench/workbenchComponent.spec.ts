import type { IContentRenderer } from '../../dockview/types';
import type { GridviewComponent } from '../../gridview/gridviewComponent';
import { GridviewPanel } from '../../gridview/gridviewPanel';
import type { IFrameworkPart, PanelUpdateEvent } from '../../panel/types';
import {
    DEFAULT_HEADER_SIZE,
    DEFAULT_STATUS_BAR_SIZE,
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
    } = {}
): WorkbenchComponent {
    return new WorkbenchComponent(container, {
        header: opts.header ? { component: 'header' } : undefined,
        toolbar: opts.toolbar ? { component: 'toolbar' } : undefined,
        statusBar: opts.statusBar ? { component: 'status' } : undefined,
        createComponent: (options) => new TestBand(options.id, options.name),
        dockview: {
            createComponent: (options) =>
                new TestEditorPanel(options.id, options.name),
        },
    });
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
});
