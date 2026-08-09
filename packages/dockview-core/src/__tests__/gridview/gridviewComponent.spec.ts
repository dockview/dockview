import { GridviewComponent } from '../../gridview/gridviewComponent';
import { GridviewPanel } from '../../gridview/gridviewPanel';
import { CompositeDisposable } from '../../lifecycle';
import { IFrameworkPart } from '../../panel/types';
import { Orientation } from '../../splitview/splitview';

class TestGridview extends GridviewPanel {
    constructor(id: string, componentName: string) {
        super(id, componentName);

        this.api.initialize(this);

        this.element.id = id;
    }

    getComponent(): IFrameworkPart {
        return {
            update: (params) => {
                //
            },
            dispose: () => {
                //
            },
        };
    }
}

describe('gridview', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
    });

    test('update className', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
            className: 'test-a test-b',
        });

        expect(gridview.element.className).toBe('test-a test-b');

        gridview.updateOptions({ className: 'test-b test-c' });

        expect(gridview.element.className).toBe('test-b test-c');
    });

    test('added views are visible by default', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        const panel = gridview.getPanel('panel_1');

        expect(panel?.api.isVisible).toBeTruthy();
    });

    test('remove panel', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(gridview.size).toBe(1);

        const panel1 = gridview.getPanel('panel1')!;

        gridview.removePanel(panel1);

        expect(gridview.size).toBe(0);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(gridview.size).toBe(1);
    });

    test('active panel', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        const panel1 = gridview.getPanel('panel1')!;
        const panel2 = gridview.getPanel('panel2')!;
        const panel3 = gridview.getPanel('panel3')!;

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeTruthy();

        panel1.api.setActive();

        expect(panel1.api.isActive).toBeTruthy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeFalsy();

        panel2.api.setActive();

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeTruthy();
        expect(panel3.api.isActive).toBeFalsy();

        panel3.api.setActive();

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeTruthy();

        gridview.removePanel(panel3);

        expect(panel1.api.isActive).toBeTruthy();
        expect(panel2.api.isActive).toBeFalsy();

        gridview.removePanel(panel1);

        expect(panel2.api.isActive).toBeTruthy();

        gridview.removePanel(panel2);
    });

    test('deserialize and serialize a layout', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        expect(container.querySelectorAll('.dv-grid-view')).toHaveLength(1);

        gridview.layout(800, 400);
        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 300,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 300,
                            visible: false,
                            data: {
                                id: 'panel_2',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            visible: true,
                            data: {
                                id: 'panel_3',
                                component: 'default',
                                snap: true,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(container.querySelectorAll('.dv-grid-view')).toHaveLength(1);

        gridview.layout(800, 400, true);

        const panel1 = gridview.getPanel('panel_1')!;
        const panel2 = gridview.getPanel('panel_2')!;
        const panel3 = gridview.getPanel('panel_3')!;

        expect(panel1?.api.isVisible).toBeTruthy();
        expect(panel1?.api.id).toBe('panel_1');
        expect(panel1?.api.isActive).toBeTruthy();
        expect(panel1?.api.isFocused).toBeFalsy();
        expect(panel1?.api.height).toBe(400);
        expect(panel1?.api.width).toBe(300);

        expect(panel2?.api.isVisible).toBeFalsy();
        expect(panel2?.api.id).toBe('panel_2');
        expect(panel2?.api.isActive).toBeFalsy();
        expect(panel2?.api.isFocused).toBeFalsy();
        expect(panel2?.api.height).toBe(400);
        expect(panel2?.api.width).toBe(0);

        expect(panel3?.api.isVisible).toBeTruthy();
        expect(panel3?.api.id).toBe('panel_3');
        expect(panel3?.api.isActive).toBeFalsy();
        expect(panel3?.api.isFocused).toBeFalsy();
        expect(panel3?.api.height).toBe(400);
        expect(panel3?.api.width).toBe(500);

        panel2.api.setActive();
        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeTruthy();
        expect(panel3.api.isActive).toBeFalsy();

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 300,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 300,
                            visible: false,
                            data: {
                                id: 'panel_2',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 500,
                            data: {
                                id: 'panel_3',
                                component: 'default',
                                snap: true,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_2',
        });
    });

    test('toJSON shouldnt fire any layout events', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(1000, 1000);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        const disposable = gridview.onDidLayoutChange(() => {
            fail('onDidLayoutChange shouldnt have been called');
        });

        const result = gridview.toJSON();
        expect(result).toBeTruthy();

        disposable.dispose();
    });

    test('gridview events', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        let events: { group: GridviewPanel | undefined; type: string }[] = [];

        const disposable = new CompositeDisposable(
            gridview.onDidAddGroup((group) => {
                events.push({ type: 'ADD', group });
            }),
            gridview.onDidActiveGroupChange((group) => {
                events.push({ type: 'ACTIVE', group });
            }),
            gridview.onDidRemoveGroup((group) => {
                events.push({ type: 'REMOVE', group });
            })
        );

        gridview.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        const panel1 = gridview.getPanel('panel_1')!;

        expect(events).toEqual([
            {
                type: 'ADD',
                group: panel1,
            },
            {
                type: 'ACTIVE',
                group: panel1,
            },
        ]);
        events = [];

        gridview.addPanel({
            id: 'panel_2',
            component: 'default',
        });

        const panel2 = gridview.getPanel('panel_2')!;

        expect(events).toEqual([
            {
                type: 'ADD',
                group: panel2,
            },
            {
                type: 'ACTIVE',
                group: panel2,
            },
        ]);
        events = [];

        gridview.addPanel({
            id: 'panel_3',
            component: 'default',
        });

        const panel3 = gridview.getPanel('panel_3')!;

        expect(events).toEqual([
            {
                type: 'ADD',
                group: panel3,
            },
            {
                type: 'ACTIVE',
                group: panel3,
            },
        ]);
        events = [];

        gridview.removePanel(panel2);

        expect(events).toEqual([
            {
                type: 'REMOVE',
                group: panel2,
            },
        ]);
        events = [];

        gridview.removePanel(panel3);

        expect(events).toEqual([
            {
                type: 'REMOVE',
                group: panel3,
            },
            {
                type: 'ACTIVE',
                group: panel1,
            },
        ]);
        events = [];

        gridview.removePanel(panel1);

        expect(events).toEqual([
            {
                type: 'REMOVE',
                group: panel1,
            },
            {
                type: 'ACTIVE',
                group: undefined,
            },
        ]);
        events = [];

        disposable.dispose();
    });

    test('dispose of gridviewComponent', () => {
        expect(container.childNodes).toHaveLength(0);

        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        expect(container.childNodes.length).toBeGreaterThan(0);

        gridview.dispose();

        expect(container.children).toHaveLength(0);
    });

    test('#1/VERTICAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#2/HORIZONTAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 800,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 800,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#3/HORIZONTAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#4/HORIZONTAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#5/VERTICAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#5/VERTICAL/proportional/false', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#6/VERTICAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 200,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 200,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#7/VERTICAL layout first', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 200,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 200,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#8/VERTICAL layout after', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 200,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        // gridview.layout(800, 400, true);

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 200,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 100,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#9/HORIZONTAL', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#9/HORIZONTAL/proportional/false', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('#10/HORIZONTAL scale x:1.5 y:2', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        // relayout to a few random sizes
        gridview.layout(234, 654);
        gridview.layout(4532, 34562);
        gridview.layout(1200, 800);

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 800,
                width: 1200,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 300,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 600,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_1',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 300,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('panel is disposed of when component is disposed', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(1000, 1000);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel1 = gridview.getPanel('panel1')!;
        const panel2 = gridview.getPanel('panel2')!;

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        gridview.dispose();

        expect(panel1Spy).toHaveBeenCalledTimes(1);
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is disposed of when removed', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        gridview.layout(1000, 1000);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel1 = gridview.getPanel('panel1')!;
        const panel2 = gridview.getPanel('panel2')!;

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        gridview.removePanel(panel2);

        expect(panel1Spy).not.toHaveBeenCalled();
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is disposed of when fromJSON is called', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        gridview.layout(1000, 1000);

        gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel1 = gridview.getPanel('panel1')!;
        const panel2 = gridview.getPanel('panel2')!;

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        gridview.fromJSON({
            grid: {
                height: 0,
                width: 0,
                root: { type: 'branch', data: [] },
                orientation: Orientation.HORIZONTAL,
            },
        });

        expect(panel1Spy).toHaveBeenCalledTimes(1);
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('fromJSON  events should still fire', () => {
        jest.useFakeTimers();

        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        let addGroup: GridviewPanel[] = [];
        let removeGroup: GridviewPanel[] = [];
        let activeGroup: (GridviewPanel | undefined)[] = [];
        let layoutChange = 0;
        let layoutChangeFromJson = 0;

        const disposable = new CompositeDisposable(
            gridview.onDidAddGroup((panel) => {
                addGroup.push(panel);
            }),
            gridview.onDidRemoveGroup((panel) => {
                removeGroup.push(panel);
            }),
            gridview.onDidActiveGroupChange((event) => {
                activeGroup.push(event);
            }),
            gridview.onDidLayoutChange(() => {
                layoutChange++;
            }),
            gridview.onDidLayoutFromJSON(() => {
                layoutChangeFromJson++;
            })
        );

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_2',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_3',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_4',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        jest.runAllTimers();

        expect(addGroup).toHaveLength(4);
        expect(removeGroup).toHaveLength(0);
        expect(activeGroup).toHaveLength(1);
        expect(activeGroup[0]).toEqual(gridview.getPanel('panel_1'));
        expect(layoutChange).toBe(1);
        expect(layoutChangeFromJson).toBe(1);

        addGroup = [];
        activeGroup = [];

        gridview.fromJSON({
            grid: {
                height: 0,
                width: 0,
                root: { type: 'branch', data: [] },
                orientation: Orientation.HORIZONTAL,
            },
        });

        jest.runAllTimers();

        expect(addGroup).toHaveLength(0);
        expect(removeGroup).toHaveLength(4);
        expect(activeGroup).toHaveLength(1);
        expect(layoutChange).toBe(2);
        expect(layoutChangeFromJson).toBe(2);

        return disposable.dispose();
    });

    test('that fromJSON layouts are resized to the current dimensions', async () => {
        const container = document.createElement('div');

        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(1600, 800);

        gridview.fromJSON({
            grid: {
                height: 400,
                width: 800,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 400,
                    data: [
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 400,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 250,
                                    data: {
                                        id: 'panel_2',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 150,
                                    data: {
                                        id: 'panel_3',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 200,
                            data: {
                                id: 'panel_4',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 800,
                width: 1600,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 800,
                    data: [
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 800,
                            data: [
                                {
                                    type: 'leaf',
                                    size: 500,
                                    data: {
                                        id: 'panel_2',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                                {
                                    type: 'leaf',
                                    size: 300,
                                    data: {
                                        id: 'panel_3',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 400,
                            data: {
                                id: 'panel_4',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('that a deep HORIZONTAL layout with fromJSON dimensions identical to the current dimensions loads', async () => {
        const container = document.createElement('div');

        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(6000, 5000);

        gridview.fromJSON({
            grid: {
                height: 5000,
                width: 6000,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 5000,
                    data: [
                        {
                            type: 'leaf',
                            size: 2000,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 3000,
                            data: [
                                {
                                    type: 'branch',
                                    size: 4000,
                                    data: [
                                        {
                                            type: 'leaf',
                                            size: 1000,
                                            data: {
                                                id: 'panel_2',
                                                component: 'default',
                                                snap: false,
                                            },
                                        },
                                        {
                                            type: 'branch',
                                            size: 2000,
                                            data: [
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_3',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_4',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: 'leaf',
                                    size: 1000,
                                    data: {
                                        id: 'panel_5',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 1000,
                            data: {
                                id: 'panel_6',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 5000,
                width: 6000,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 5000,
                    data: [
                        {
                            type: 'leaf',
                            size: 2000,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 3000,
                            data: [
                                {
                                    type: 'branch',
                                    size: 4000,
                                    data: [
                                        {
                                            type: 'leaf',
                                            size: 1000,
                                            data: {
                                                id: 'panel_2',
                                                component: 'default',
                                                snap: false,
                                            },
                                        },
                                        {
                                            type: 'branch',
                                            size: 2000,
                                            data: [
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_3',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_4',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: 'leaf',
                                    size: 1000,
                                    data: {
                                        id: 'panel_5',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 1000,
                            data: {
                                id: 'panel_6',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        gridview.layout(6000, 5000, true);

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 5000,
                width: 6000,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    size: 5000,
                    data: [
                        {
                            type: 'leaf',
                            size: 2000,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 3000,
                            data: [
                                {
                                    type: 'branch',
                                    size: 4000,
                                    data: [
                                        {
                                            type: 'leaf',
                                            size: 1000,
                                            data: {
                                                id: 'panel_2',
                                                component: 'default',
                                                snap: false,
                                            },
                                        },
                                        {
                                            type: 'branch',
                                            size: 2000,
                                            data: [
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_3',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_4',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: 'leaf',
                                    size: 1000,
                                    data: {
                                        id: 'panel_5',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 1000,
                            data: {
                                id: 'panel_6',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('that a deep VERTICAL layout with fromJSON dimensions identical to the current dimensions loads', async () => {
        const container = document.createElement('div');

        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(5000, 6000);

        gridview.fromJSON({
            grid: {
                height: 6000,
                width: 5000,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 5000,
                    data: [
                        {
                            type: 'leaf',
                            size: 2000,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 3000,
                            data: [
                                {
                                    type: 'branch',
                                    size: 4000,
                                    data: [
                                        {
                                            type: 'leaf',
                                            size: 1000,
                                            data: {
                                                id: 'panel_2',
                                                component: 'default',
                                                snap: false,
                                            },
                                        },
                                        {
                                            type: 'branch',
                                            size: 2000,
                                            data: [
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_3',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_4',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: 'leaf',
                                    size: 1000,
                                    data: {
                                        id: 'panel_5',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 1000,
                            data: {
                                id: 'panel_6',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 6000,
                width: 5000,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 5000,
                    data: [
                        {
                            type: 'leaf',
                            size: 2000,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 3000,
                            data: [
                                {
                                    type: 'branch',
                                    size: 4000,
                                    data: [
                                        {
                                            type: 'leaf',
                                            size: 1000,
                                            data: {
                                                id: 'panel_2',
                                                component: 'default',
                                                snap: false,
                                            },
                                        },
                                        {
                                            type: 'branch',
                                            size: 2000,
                                            data: [
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_3',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_4',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: 'leaf',
                                    size: 1000,
                                    data: {
                                        id: 'panel_5',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 1000,
                            data: {
                                id: 'panel_6',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });

        gridview.layout(5000, 6000, true);

        expect(JSON.parse(JSON.stringify(gridview.toJSON()))).toEqual({
            grid: {
                height: 6000,
                width: 5000,
                orientation: Orientation.VERTICAL,
                root: {
                    type: 'branch',
                    size: 5000,
                    data: [
                        {
                            type: 'leaf',
                            size: 2000,
                            data: {
                                id: 'panel_1',
                                component: 'default',
                                snap: false,
                            },
                        },
                        {
                            type: 'branch',
                            size: 3000,
                            data: [
                                {
                                    type: 'branch',
                                    size: 4000,
                                    data: [
                                        {
                                            type: 'leaf',
                                            size: 1000,
                                            data: {
                                                id: 'panel_2',
                                                component: 'default',
                                                snap: false,
                                            },
                                        },
                                        {
                                            type: 'branch',
                                            size: 2000,
                                            data: [
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_3',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                                {
                                                    type: 'leaf',
                                                    size: 2000,
                                                    data: {
                                                        id: 'panel_4',
                                                        component: 'default',
                                                        snap: false,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: 'leaf',
                                    size: 1000,
                                    data: {
                                        id: 'panel_5',
                                        component: 'default',
                                        snap: false,
                                    },
                                },
                            ],
                        },
                        {
                            type: 'leaf',
                            size: 1000,
                            data: {
                                id: 'panel_6',
                                component: 'default',
                                snap: false,
                            },
                        },
                    ],
                },
            },
            activePanel: 'panel_1',
        });
    });

    test('that loading a corrupt layout throws an error and leaves a clean gridview behind', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error(`unsupported panel '${options.name}'`);
                }
            },
        });

        let el = gridview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes).toHaveLength(0);

        expect(() => {
            gridview.fromJSON({
                grid: {
                    height: 400,
                    width: 800,
                    orientation: Orientation.HORIZONTAL,
                    root: {
                        type: 'branch',
                        size: 400,
                        data: [
                            {
                                type: 'leaf',
                                size: 200,
                                data: {
                                    id: 'panel_1',
                                    component: 'default',
                                    snap: false,
                                },
                            },
                            {
                                type: 'branch',
                                size: 400,
                                data: [
                                    {
                                        type: 'leaf',
                                        size: 250,
                                        data: {
                                            id: 'panel_1',
                                            component: 'default',
                                            snap: false,
                                        },
                                    },
                                    {
                                        type: 'leaf',
                                        size: 150,
                                        data: {
                                            id: 'panel_1',
                                            component: 'somethingBad',
                                            snap: false,
                                        },
                                    },
                                ],
                            },
                            {
                                type: 'leaf',
                                size: 200,
                                data: {
                                    id: 'panel_1',
                                    component: 'default',
                                    snap: false,
                                },
                            },
                        ],
                    },
                },
                activePanel: 'panel_1',
            });
        }).toThrow("unsupported panel 'somethingBad'");

        expect(gridview.groups).toHaveLength(0);

        el = gridview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes).toHaveLength(0);
    });

    test('that disableAutoResizing is false by default', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        expect(gridview.disableResizing).toBeFalsy();
    });

    test('that disableAutoResizing can be enabled', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
            disableAutoResizing: true,
        });

        expect(gridview.disableResizing).toBeTruthy();
    });

    test('that setVisible toggles visiblity', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
            disableAutoResizing: true,
        });
        gridview.layout(1000, 1000);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        expect(panel1.api.isVisible).toBeTruthy();
        expect(panel2.api.isVisible).toBeTruthy();

        panel1.api.setVisible(false);
        expect(panel1.api.isVisible).toBeFalsy();
        expect(panel2.api.isVisible).toBeTruthy();

        panel1.api.setVisible(true);
        expect(panel1.api.isVisible).toBeTruthy();
        expect(panel2.api.isVisible).toBeTruthy();
    });

    test('registerPanel is called after doAddGroup - panel api events work immediately', () => {
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        gridview.layout(800, 400);

        const panel1 = gridview.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        expect(panel1.api).toBeDefined();
        expect(panel1.api.onDidFocusChange).toBeDefined();

        let focusEventCount = 0;
        const disposable = panel1.api.onDidFocusChange((event) => {
            focusEventCount++;
        });

        // adding a second panel must not throw
        // "Cannot read properties of undefined (reading 'onDidFocusChange')"
        const panel2 = gridview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: panel1.id, direction: 'right' },
        });

        expect(panel1.api).toBeDefined();
        expect(panel2.api).toBeDefined();
        expect(panel1.api.onDidFocusChange).toBeDefined();
        expect(panel2.api.onDidFocusChange).toBeDefined();

        expect(panel1.api.isVisible).toBeTruthy();
        expect(panel2.api.isVisible).toBeTruthy();

        const disposable2 = panel2.api.onDidFocusChange((event) => {
            focusEventCount++;
        });

        disposable.dispose();
        disposable2.dispose();

        // The main test is that we got this far without errors
        expect(true).toBeTruthy();
    });

    function createGridview(
        orientation: Orientation = Orientation.VERTICAL,
        proportionalLayout = false
    ): GridviewComponent {
        return new GridviewComponent(container, {
            proportionalLayout,
            orientation,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
    }

    test('orientation getter reflects the constructor value', () => {
        const gridview = createGridview(Orientation.HORIZONTAL);
        expect(gridview.orientation).toBe(Orientation.HORIZONTAL);
    });

    test('orientation setter updates the underlying gridview', () => {
        const gridview = createGridview(Orientation.VERTICAL);
        gridview.layout(800, 400);

        expect(gridview.orientation).toBe(Orientation.VERTICAL);

        gridview.orientation = Orientation.HORIZONTAL;

        expect(gridview.orientation).toBe(Orientation.HORIZONTAL);
    });

    test('deserializer getter/setter round-trips the value', () => {
        const gridview = createGridview();

        expect(gridview.deserializer).toBeUndefined();

        const deserializer = {
            fromJSON: jest.fn(),
        };

        gridview.deserializer = deserializer;

        expect(gridview.deserializer).toBe(deserializer);

        gridview.deserializer = undefined;

        expect(gridview.deserializer).toBeUndefined();
    });

    test('options getter exposes the provided options', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);

        expect(gridview.options.orientation).toBe(Orientation.HORIZONTAL);
        expect(gridview.options.proportionalLayout).toBe(true);
    });

    test('updateOptions changes the orientation', () => {
        const gridview = createGridview(Orientation.VERTICAL);
        gridview.layout(800, 400);

        expect(gridview.orientation).toBe(Orientation.VERTICAL);

        gridview.updateOptions({ orientation: Orientation.HORIZONTAL });

        expect(gridview.orientation).toBe(Orientation.HORIZONTAL);
        expect(gridview.options.orientation).toBe(Orientation.HORIZONTAL);
    });

    test('updateOptions with an unchanged orientation is a no-op for orientation', () => {
        const gridview = createGridview(Orientation.VERTICAL);
        gridview.layout(800, 400);

        gridview.updateOptions({ orientation: Orientation.VERTICAL });

        expect(gridview.orientation).toBe(Orientation.VERTICAL);
    });

    test('setActive makes the requested panel active and deactivates the others', () => {
        const gridview = createGridview();
        gridview.layout(800, 400);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        // panel2 was added last, so it is active
        expect(panel2.api.isActive).toBeTruthy();

        gridview.setActive(panel1 as GridviewPanel);

        expect(panel1.api.isActive).toBeTruthy();
        expect(panel2.api.isActive).toBeFalsy();
    });

    test('focus does not throw when a panel is active', () => {
        const gridview = createGridview();
        gridview.layout(800, 400);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        const spy = jest.spyOn(panel1 as GridviewPanel, 'focus');

        expect(() => gridview.focus()).not.toThrow();
        expect(spy).toHaveBeenCalledTimes(1);
    });

    test('focus does not throw when there is no active panel', () => {
        const gridview = createGridview();
        gridview.layout(800, 400);

        expect(() => gridview.focus()).not.toThrow();
    });

    test('a panel becomes active when its api fires a focus event', () => {
        const gridview = createGridview();
        gridview.layout(800, 400);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        // panel2 is active (added last)
        expect(panel2.api.isActive).toBeTruthy();

        // simulate panel1 gaining focus
        panel1.api._onDidChangeFocus.fire({ isFocused: true });

        expect(panel1.api.isActive).toBeTruthy();
        expect(panel2.api.isActive).toBeFalsy();
    });

    test('a focus event with isFocused=false does not change the active panel', () => {
        const gridview = createGridview();
        gridview.layout(800, 400);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = gridview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        expect(panel2.api.isActive).toBeTruthy();

        panel1.api._onDidChangeFocus.fire({ isFocused: false });

        expect(panel2.api.isActive).toBeTruthy();
        expect(panel1.api.isActive).toBeFalsy();
    });

    test('movePanel repositions a panel relative to a reference', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        gridview.addPanel({ id: 'panel1', component: 'default' });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });
        const panel3 = gridview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel2', direction: 'right' },
        });

        expect(gridview.size).toBe(3);

        gridview.movePanel(panel3 as GridviewPanel, {
            direction: 'left',
            reference: 'panel1',
        });

        expect(gridview.size).toBe(3);
        expect(gridview.getPanel('panel1')).toBeTruthy();
        expect(gridview.getPanel('panel2')).toBeTruthy();
        expect(gridview.getPanel('panel3')).toBeTruthy();
    });

    test('movePanel throws when the reference group does not exist', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(() =>
            gridview.movePanel(panel1 as GridviewPanel, {
                direction: 'right',
                reference: 'does_not_exist',
            })
        ).toThrow('reference group does_not_exist does not exist');

        // The panel must NOT have been removed by the failed move: validation
        // runs before the panel is taken out of the grid.
        expect(gridview.size).toBe(1);
        expect(gridview.getPanel('panel1')).toBeTruthy();
    });

    test('movePanel throws when the direction resolves to center', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        gridview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = gridview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });

        expect(() =>
            gridview.movePanel(panel2 as GridviewPanel, {
                direction: 'within',
                reference: 'panel1',
            })
        ).toThrow('center not supported as an option');

        expect(gridview.size).toBe(2);
        expect(gridview.getPanel('panel1')).toBeTruthy();
        expect(gridview.getPanel('panel2')).toBeTruthy();
    });

    test('addPanel throws when the reference panel does not exist', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        expect(() =>
            gridview.addPanel({
                id: 'panel1',
                component: 'default',
                position: {
                    referencePanel: 'does_not_exist',
                    direction: 'right',
                },
            })
        ).toThrow('reference group does_not_exist does not exist');
    });

    test('addPanel throws when the position direction resolves to center', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        gridview.addPanel({ id: 'panel1', component: 'default' });

        expect(() =>
            gridview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { referencePanel: 'panel1', direction: 'within' },
            })
        ).toThrow('center not supported as an option');
    });

    test('addPanel honours an explicit location', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        gridview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = gridview.addPanel({
            id: 'panel2',
            component: 'default',
            location: [0],
        });

        expect(gridview.size).toBe(2);
        expect(panel2.api.isActive).toBeTruthy();
    });

    test('moveGroup swaps two siblings within the same parent', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });

        // panel1 and panel2 are siblings under the root branch - moving
        // panel2 to the right of panel1 is a swap within the same parent
        expect(() =>
            gridview.moveGroup(panel1 as GridviewPanel, 'panel2', 'right')
        ).not.toThrow();

        expect(gridview.size).toBe(2);
        expect(gridview.getPanel('panel1')).toBeTruthy();
        expect(gridview.getPanel('panel2')).toBeTruthy();
    });

    test('moveGroup relocates a group into a different parent', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        gridview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });
        const panel3 = gridview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel2', direction: 'below' },
        });

        // panel3 lives in a nested branch alongside panel2; move it up
        // against panel1 which lives in the root branch (different parent)
        expect(() =>
            gridview.moveGroup(panel1 as GridviewPanel, panel3.id, 'above')
        ).not.toThrow();

        expect(gridview.size).toBe(3);
        expect(gridview.getPanel('panel3')).toBeTruthy();
    });

    test('moveGroup throws for an unknown source group', () => {
        const gridview = createGridview(Orientation.HORIZONTAL, true);
        gridview.layout(1000, 1000);

        const panel1 = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(() =>
            gridview.moveGroup(
                panel1 as GridviewPanel,
                'does_not_exist',
                'right'
            )
        ).toThrow('invalid operation');
    });

    test('setConstraints fires onDidChange so cached branch size bounds invalidate', () => {
        // Regression: BranchNode caches aggregate minimum/maximum size and
        // invalidates on a child's onDidChange. A runtime constraint change
        // must therefore surface as onDidChange, otherwise the cache (and the
        // parent splitview's clamping) stays stale after setConstraints.
        const gridview = new GridviewComponent(container, {
            proportionalLayout: false,
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestGridview(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        gridview.layout(1000, 1000);

        const panel = gridview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        let fired = 0;
        const disposable = panel.onDidChange(() => {
            fired++;
        });

        panel.api.setConstraints({ minimumWidth: 400 });

        expect(fired).toBeGreaterThan(0);

        disposable.dispose();
        gridview.dispose();
    });
});
