import { fireEvent } from '@testing-library/dom';
import { SplitviewApi } from '../../api/component.api';
import { PanelDimensionChangeEvent } from '../../api/panelApi';
import { Emitter } from '../../events';
import { CompositeDisposable } from '../../lifecycle';
import { Orientation } from '../../splitview/splitview';
import { SplitviewComponent } from '../../splitview/splitviewComponent';
import { SplitviewPanel } from '../../splitview/splitviewPanel';

class TestPanel extends SplitviewPanel {
    getComponent() {
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

describe('componentSplitview', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.className = 'container';
    });

    test('that the container is not removed when grid is disposed', () => {
        const root = document.createElement('div');
        const container = document.createElement('div');
        root.appendChild(container);

        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.dispose();

        expect(container.parentElement).toBe(root);
        expect(container.children).toHaveLength(0);
    });

    test('event leakage', () => {
        Emitter.setLeakageMonitorEnabled(true);

        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(600, 400);

        const panel1 = splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = splitview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        splitview.movePanel(0, 1);

        splitview.removePanel(panel1);

        splitview.dispose();

        if (Emitter.MEMORY_LEAK_WATCHER.size > 0) {
            for (const entry of Array.from(
                Emitter.MEMORY_LEAK_WATCHER.events
            )) {
                console.log(entry[1]);
            }
            throw new Error('not all listeners disposed');
        }

        Emitter.setLeakageMonitorEnabled(false);
    });

    test('remove panel', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(600, 400);

        splitview.addPanel({ id: 'panel1', component: 'default' });
        splitview.addPanel({ id: 'panel2', component: 'default' });
        splitview.addPanel({ id: 'panel3', component: 'default' });

        const panel1 = splitview.getPanel('panel1')!;
        const panel2 = splitview.getPanel('panel2')!;
        const panel3 = splitview.getPanel('panel3')!;

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeTruthy();

        splitview.removePanel(panel3);

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeTruthy();
        expect(splitview).toHaveLength(2);

        splitview.removePanel(panel1);
        expect(panel2.api.isActive).toBeTruthy();
        expect(splitview).toHaveLength(1);

        splitview.removePanel(panel2);
        expect(splitview).toHaveLength(0);
    });

    test('horizontal dimensions', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(600, 400);

        expect(splitview.height).toBe(400);
        expect(splitview.width).toBe(600);
    });

    test('vertical dimensions', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(600, 400);

        expect(splitview.height).toBe(400);
        expect(splitview.width).toBe(600);
    });

    test('api resize', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(400, 600);
        splitview.addPanel({ id: 'panel1', component: 'default' });
        splitview.addPanel({ id: 'panel2', component: 'default' });
        splitview.addPanel({ id: 'panel3', component: 'default' });

        const panel1 = splitview.getPanel('panel1')!;
        const panel2 = splitview.getPanel('panel2')!;
        const panel3 = splitview.getPanel('panel3')!;

        expect(panel1.width).toBe(400);
        expect(panel1.height).toBe(200);
        expect(panel2.width).toBe(400);
        expect(panel2.height).toBe(200);
        expect(panel3.width).toBe(400);
        expect(panel3.height).toBe(200);

        panel1.api.setSize({ size: 100 });

        expect(panel1.width).toBe(400);
        expect(panel1.height).toBe(100);
        expect(panel2.width).toBe(400);
        expect(panel2.height).toBe(200);
        expect(panel3.width).toBe(400);
        expect(panel3.height).toBe(300);

        panel2.api.setSize({ size: 100 });

        expect(panel1.width).toBe(400);
        expect(panel1.height).toBe(100);
        expect(panel2.width).toBe(400);
        expect(panel2.height).toBe(100);
        expect(panel3.width).toBe(400);
        expect(panel3.height).toBe(400);

        panel3.api.setSize({ size: 100 });

        expect(panel1.width).toBe(400);
        expect(panel1.height).toBe(100);
        expect(panel2.width).toBe(400);
        expect(panel2.height).toBe(400);
        expect(panel3.width).toBe(400);
        expect(panel3.height).toBe(100);
    });

    test('api', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(600, 400);
        splitview.addPanel({ id: 'panel1', component: 'default' });

        const panel1 = splitview.getPanel('panel1');

        expect(panel1!.api.height).toBe(400);
        expect(panel1!.api.width).toBe(600);
        expect(panel1!.api.id).toBe('panel1');
        expect(panel1!.api.isActive).toBeTruthy();
        // expect(panel1?.api.isFocused).toBeFalsy();
        expect(panel1!.api.isVisible).toBeTruthy();

        splitview.addPanel({ id: 'panel2', component: 'default' });

        const panel2 = splitview.getPanel('panel2');

        expect(panel1!.api.isActive).toBeFalsy();

        expect(panel2!.api.height).toBe(400);
        expect(panel2!.api.width).toBe(300);
        expect(panel2!.api.id).toBe('panel2');
        expect(panel2!.api.isActive).toBeTruthy();
        // expect(panel2!.api.isFocused).toBeFalsy();
        expect(panel2!.api.isVisible).toBeTruthy();

        panel1?.api.setActive();

        expect(panel1!.api.isActive).toBeTruthy();
        expect(panel2!.api.isActive).toBeFalsy();
    });

    test('vertical panels', () => {
        const disposables = new CompositeDisposable();

        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(300, 200);

        splitview.addPanel({ id: 'panel1', component: 'default' });
        splitview.addPanel({ id: 'panel2', component: 'default' });

        const panel1 = splitview.getPanel('panel1') as SplitviewPanel;
        const panel2 = splitview.getPanel('panel2') as SplitviewPanel;

        let panel1Dimensions: PanelDimensionChangeEvent | undefined;
        disposables.addDisposables(
            panel1.api.onDidDimensionsChange((event) => {
                panel1Dimensions = event;
            })
        );

        let panel2Dimensions: PanelDimensionChangeEvent | undefined;
        disposables.addDisposables(
            panel2.api.onDidDimensionsChange((event) => {
                panel2Dimensions = event;
            })
        );

        splitview.layout(600, 400);

        expect(panel1Dimensions).toEqual({ width: 600, height: 200 });
        expect(panel2Dimensions).toEqual({ width: 600, height: 200 });

        panel1.api.setSize({ size: 300 });

        expect(panel1Dimensions).toEqual({ width: 600, height: 300 });
        expect(panel2Dimensions).toEqual({ width: 600, height: 100 });

        splitview.layout(200, 600);

        expect(panel1Dimensions).toEqual({ width: 200, height: 450 });
        expect(panel2Dimensions).toEqual({ width: 200, height: 150 });

        disposables.dispose();
        splitview.dispose();
    });

    test('horizontal panels', () => {
        const disposables = new CompositeDisposable();

        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(300, 200);

        splitview.addPanel({ id: 'panel1', component: 'default' });
        splitview.addPanel({ id: 'panel2', component: 'default' });

        const panel1 = splitview.getPanel('panel1') as SplitviewPanel;
        const panel2 = splitview.getPanel('panel2') as SplitviewPanel;

        let panel1Dimensions: PanelDimensionChangeEvent | undefined;
        disposables.addDisposables(
            panel1.api.onDidDimensionsChange((event) => {
                panel1Dimensions = event;
            })
        );

        let panel2Dimensions: PanelDimensionChangeEvent | undefined;
        disposables.addDisposables(
            panel2.api.onDidDimensionsChange((event) => {
                panel2Dimensions = event;
            })
        );

        splitview.layout(600, 400);

        expect(panel1Dimensions).toEqual({ width: 300, height: 400 });
        expect(panel2Dimensions).toEqual({ width: 300, height: 400 });

        panel1.api.setSize({ size: 200 });

        expect(panel1Dimensions).toEqual({ width: 200, height: 400 });
        expect(panel2Dimensions).toEqual({ width: 400, height: 400 });

        splitview.layout(200, 600);

        expect(panel1Dimensions).toEqual({ width: 67, height: 600 });
        expect(panel2Dimensions).toEqual({ width: 133, height: 600 });

        disposables.dispose();
        splitview.dispose();
    });

    test('serialization', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(400, 6);

        expect(
            container.querySelectorAll('.dv-split-view-container')
        ).toHaveLength(1);

        splitview.fromJSON({
            views: [
                {
                    size: 1,
                    data: { id: 'panel1', component: 'default' },
                    snap: false,
                },
                {
                    size: 2,
                    data: { id: 'panel2', component: 'default' },
                    snap: true,
                },
                { size: 3, data: { id: 'panel3', component: 'default' } },
            ],
            size: 6,
            orientation: Orientation.VERTICAL,
            activeView: 'panel1',
        });

        expect(
            container.querySelectorAll('.dv-split-view-container')
        ).toHaveLength(1);

        expect(splitview).toHaveLength(3);

        expect(JSON.parse(JSON.stringify(splitview.toJSON()))).toEqual({
            views: [
                {
                    size: 1,
                    data: { id: 'panel1', component: 'default' },
                    snap: false,
                },
                {
                    size: 2,
                    data: { id: 'panel2', component: 'default' },
                    snap: true,
                },
                {
                    size: 3,
                    data: { id: 'panel3', component: 'default' },
                    snap: false,
                },
            ],
            size: 6,
            orientation: Orientation.VERTICAL,
            activeView: 'panel1',
        });
    });

    test('a hidden panel round-trips hidden at its cached size, not size 0', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(1000, 500);

        const panel1 = splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        splitview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        // hide panel1: getViewSize now reports 0, but its real size is cached
        splitview.setVisible(panel1, false);
        expect(panel1.api.isVisible).toBe(false);

        const json = splitview.toJSON();
        const v1 = json.views.find((v) => v.data.id === 'panel1')!;
        const v2 = json.views.find((v) => v.data.id === 'panel2')!;
        expect(v1.visible).toBe(false);
        expect(v1.size).toBe(500);
        // visible panels keep the legacy shape (no `visible` key)
        expect('visible' in v2).toBe(false);
        expect(v2.size).toBe(1000);

        // round-trip: the panel must reload hidden at its cached size
        splitview.fromJSON(JSON.parse(JSON.stringify(json)));
        splitview.layout(1000, 500);

        const restored1 = splitview.getPanel('panel1')!;
        const restored2 = splitview.getPanel('panel2')!;
        expect(restored1.api.isVisible).toBe(false);
        expect(restored2.api.isVisible).toBe(true);
        expect(restored1.width).toBe(0);
        expect(restored2.width).toBe(1000);

        const json2 = splitview.toJSON();
        const v1b = json2.views.find((v) => v.data.id === 'panel1')!;
        expect(v1b.visible).toBe(false);
        expect(v1b.size).toBe(500);

        // showing the panel again restores its pre-hide size
        splitview.setVisible(restored1, true);
        expect(restored1.api.isVisible).toBe(true);
        expect(restored1.width).toBe(500);
        expect(restored2.width).toBe(500);

        splitview.dispose();
    });

    test('fromJSON treats a missing `visible` flag as visible', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(1000, 500);

        splitview.fromJSON({
            views: [
                { size: 400, data: { id: 'panel1', component: 'default' } },
                {
                    size: 600,
                    data: { id: 'panel2', component: 'default' },
                    visible: true,
                },
            ],
            size: 1000,
            orientation: Orientation.HORIZONTAL,
        });

        expect(splitview.getPanel('panel1')!.api.isVisible).toBe(true);
        expect(splitview.getPanel('panel2')!.api.isVisible).toBe(true);
        expect(splitview.getPanel('panel1')!.width).toBe(400);
        expect(splitview.getPanel('panel2')!.width).toBe(600);

        splitview.dispose();
    });

    test('toJSON shouldnt fire any layout events', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(1000, 1000);

        splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        splitview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const disposable = splitview.onDidLayoutChange(() => {
            fail('onDidLayoutChange shouldnt have been called');
        });

        const result = splitview.toJSON();
        expect(result).toBeTruthy();

        disposable.dispose();
    });

    test('panel is disposed of when component is disposed', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(1000, 1000);

        splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        splitview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel1 = splitview.getPanel('panel1')!;
        const panel2 = splitview.getPanel('panel2')!;

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        splitview.dispose();

        expect(panel1Spy).toHaveBeenCalledTimes(1);
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is disposed of when removed', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(1000, 1000);

        splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        splitview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel1 = splitview.getPanel('panel1')!;
        const panel2 = splitview.getPanel('panel2')!;

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        splitview.removePanel(panel2);

        expect(panel1Spy).not.toHaveBeenCalled();
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is disposed of when fromJSON is called', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(1000, 1000);

        splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        splitview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel1 = splitview.getPanel('panel1')!;
        const panel2 = splitview.getPanel('panel2')!;

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        splitview.fromJSON({
            orientation: Orientation.HORIZONTAL,
            size: 0,
            views: [],
        });

        expect(panel1Spy).toHaveBeenCalledTimes(1);
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('that fromJSON layouts are resized to the current dimensions', async () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(400, 600);

        splitview.fromJSON({
            views: [
                {
                    size: 1,
                    data: { id: 'panel1', component: 'default' },
                    snap: false,
                },
                {
                    size: 2,
                    data: { id: 'panel2', component: 'default' },
                    snap: true,
                },
                { size: 3, data: { id: 'panel3', component: 'default' } },
            ],
            size: 6,
            orientation: Orientation.VERTICAL,
            activeView: 'panel1',
        });

        expect(JSON.parse(JSON.stringify(splitview.toJSON()))).toEqual({
            views: [
                {
                    size: 100,
                    data: { id: 'panel1', component: 'default' },
                    snap: false,
                },
                {
                    size: 200,
                    data: { id: 'panel2', component: 'default' },
                    snap: true,
                },
                {
                    size: 300,
                    data: { id: 'panel3', component: 'default' },
                    snap: false,
                },
            ],
            size: 600,
            orientation: Orientation.VERTICAL,
            activeView: 'panel1',
        });
    });

    test('that disableAutoResizing is false by default', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        expect(splitview.disableResizing).toBeFalsy();
    });

    test('that disableAutoResizing can be enabled', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.VERTICAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
            disableAutoResizing: true,
        });

        expect(splitview.disableResizing).toBeTruthy();
    });

    test('that setVisible toggles visiblity', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });

        splitview.layout(1000, 1000);

        const panel1 = splitview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = splitview.addPanel({
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

    test('update className', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
            className: 'test-a test-b',
        });

        expect(splitview.element.className).toBe('test-a test-b');

        splitview.updateOptions({ className: 'test-b test-c' });

        expect(splitview.element.className).toBe('test-b test-c');
    });

    test('onDidLayoutChange carries a geometry reason when a sash drag ends', () => {
        const splitview = new SplitviewComponent(container, {
            orientation: Orientation.HORIZONTAL,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new TestPanel(options.id, options.name);
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        splitview.layout(400, 400);
        splitview.addPanel({ id: 'panel1', component: 'default' });
        splitview.addPanel({ id: 'panel2', component: 'default' });
        const api = new SplitviewApi(splitview);

        const pings: string[][] = [];
        const disposable = api.onDidLayoutChange((e) =>
            pings.push([...e.reasons].sort())
        );

        const sash = container
            .getElementsByClassName('dv-sash')
            .item(0) as HTMLElement;
        expect(sash).toBeTruthy();

        fireEvent(
            sash,
            new MouseEvent('pointerdown', { clientX: 200, clientY: 100 })
        );
        fireEvent(
            document,
            new MouseEvent('pointermove', { clientX: 220, clientY: 100 })
        );
        expect(pings).toHaveLength(0); // nothing until the drag ends
        fireEvent(
            document,
            new MouseEvent('pointerup', { clientX: 220, clientY: 100 })
        );

        expect(pings).toEqual([['geometry']]);

        disposable.dispose();
        splitview.dispose();
    });

    describe('updateOptions', () => {
        function createCut(orientation: Orientation): SplitviewComponent {
            return new SplitviewComponent(container, {
                orientation,
                createComponent: (options) => {
                    switch (options.name) {
                        case 'default':
                            return new TestPanel(options.id, options.name);
                        default:
                            throw new Error('unsupported');
                    }
                },
            });
        }

        test('switching orientation re-lays out panels in the new orientation', () => {
            const splitview = createCut(Orientation.HORIZONTAL);
            const api = new SplitviewApi(splitview);

            splitview.layout(800, 200);

            const panel1 = splitview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = splitview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            expect(api.orientation).toBe(Orientation.HORIZONTAL);
            expect(panel1.api.width).toBe(400);
            expect(panel1.api.height).toBe(200);
            expect(panel2.api.width).toBe(400);
            expect(panel2.api.height).toBe(200);

            splitview.updateOptions({ orientation: Orientation.VERTICAL });

            // the component keeps its box; panels now stack vertically
            expect(api.orientation).toBe(Orientation.VERTICAL);
            expect(api.width).toBe(800);
            expect(api.height).toBe(200);
            expect(panel1.api.width).toBe(800);
            expect(panel1.api.height).toBe(100);
            expect(panel2.api.width).toBe(800);
            expect(panel2.api.height).toBe(100);

            splitview.updateOptions({ orientation: Orientation.HORIZONTAL });

            expect(api.orientation).toBe(Orientation.HORIZONTAL);
            expect(api.width).toBe(800);
            expect(api.height).toBe(200);
            expect(panel1.api.width).toBe(400);
            expect(panel1.api.height).toBe(200);
            expect(panel2.api.width).toBe(400);
            expect(panel2.api.height).toBe(200);

            splitview.dispose();
        });

        test('re-applying the current orientation leaves the layout untouched', () => {
            const splitview = createCut(Orientation.HORIZONTAL);
            const api = new SplitviewApi(splitview);

            splitview.layout(800, 200);

            const panel1 = splitview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = splitview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            const orientationSetter = jest.spyOn(panel1, 'orientation', 'set');

            splitview.updateOptions({ orientation: Orientation.HORIZONTAL });

            expect(api.orientation).toBe(Orientation.HORIZONTAL);
            expect(api.width).toBe(800);
            expect(api.height).toBe(200);
            expect(panel1.api.width).toBe(400);
            expect(panel1.api.height).toBe(200);
            expect(panel2.api.width).toBe(400);
            expect(panel2.api.height).toBe(200);
            expect(orientationSetter).not.toHaveBeenCalled();

            splitview.dispose();
        });

        test('switching orientation with proportionalLayout disabled rescales every panel', () => {
            const splitview = new SplitviewComponent(container, {
                orientation: Orientation.HORIZONTAL,
                proportionalLayout: false,
                createComponent: (options) =>
                    new TestPanel(options.id, options.name),
            });
            const api = new SplitviewApi(splitview);

            splitview.layout(800, 200);

            const panel1 = splitview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = splitview.addPanel({
                id: 'panel2',
                component: 'default',
            });
            panel1.api.setSize({ size: 300 });

            expect(panel1.api.width).toBe(300);
            expect(panel2.api.width).toBe(500);

            splitview.updateOptions({ orientation: Orientation.VERTICAL });

            expect(api.width).toBe(800);
            expect(api.height).toBe(200);
            expect(panel1.api.width).toBe(800);
            expect(panel1.api.height).toBe(75);
            expect(panel2.api.width).toBe(800);
            expect(panel2.api.height).toBe(125);

            splitview.updateOptions({ orientation: Orientation.HORIZONTAL });

            expect(panel1.api.width).toBe(300);
            expect(panel1.api.height).toBe(200);
            expect(panel2.api.width).toBe(500);
            expect(panel2.api.height).toBe(200);

            splitview.dispose();
        });

        test('switching orientation rescales the cached size of a hidden panel', () => {
            const splitview = createCut(Orientation.HORIZONTAL);

            splitview.layout(800, 200);

            const panel1 = splitview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = splitview.addPanel({
                id: 'panel2',
                component: 'default',
            });
            const panel3 = splitview.addPanel({
                id: 'panel3',
                component: 'default',
            });
            panel1.api.setSize({ size: 400 });
            panel2.api.setSize({ size: 200 });
            expect(
                [panel1, panel2, panel3].map((panel) => panel.api.width)
            ).toEqual([400, 200, 200]);

            splitview.setVisible(panel2, false);
            expect(splitview.splitview.getViewCachedVisibleSize(1)).toBe(200);
            expect(panel1.api.width).toBe(400);
            expect(panel3.api.width).toBe(400);

            splitview.updateOptions({ orientation: Orientation.VERTICAL });

            // the cached size follows the panel onto the 200px axis
            expect(splitview.splitview.getViewCachedVisibleSize(1)).toBe(50);
            expect(panel1.api.height).toBe(100);
            expect(panel3.api.height).toBe(100);

            splitview.setVisible(panel2, true);

            expect(panel2.api.width).toBe(800);
            expect(panel2.api.height).toBe(50);
            expect(
                panel1.api.height + panel2.api.height + panel3.api.height
            ).toBe(200);

            splitview.dispose();
        });

        test('updates disableResizing when disableAutoResizing is provided', () => {
            const splitview = createCut(Orientation.HORIZONTAL);
            expect(splitview.disableResizing).toBe(false);

            // The real option key is `disableAutoResizing`; providing it must
            // update `disableResizing` (regression guard: the guard previously
            // checked a non-existent `disableResizing` key and never fired).
            splitview.updateOptions({ disableAutoResizing: true });
            expect(splitview.disableResizing).toBe(true);

            splitview.updateOptions({ disableAutoResizing: false });
            expect(splitview.disableResizing).toBe(false);

            splitview.dispose();
        });

        test('leaves disableResizing unchanged when the option is omitted', () => {
            const splitview = createCut(Orientation.HORIZONTAL);
            splitview.updateOptions({ disableAutoResizing: true });
            expect(splitview.disableResizing).toBe(true);

            // An unrelated update must not reset it.
            splitview.updateOptions({ className: 'unrelated' });
            expect(splitview.disableResizing).toBe(true);

            splitview.dispose();
        });
    });
});
