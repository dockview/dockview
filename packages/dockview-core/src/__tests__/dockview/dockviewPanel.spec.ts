import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewApi } from '../../api/component.api';
import { DockviewPanel } from '../../dockview/dockviewPanel';
import { IDockviewPanelModel } from '../../dockview/dockviewPanelModel';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { fromPartial } from '@total-typescript/shoehorn';

describe('dockviewPanel', () => {
    test('update title', () => {
        const api = fromPartial<DockviewApi>({});
        const accessor = fromPartial<DockviewComponent>({});
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                onDidActiveChange: jest.fn(),
            },
        });
        const model = fromPartial<IDockviewPanelModel>({
            update: jest.fn(),
            init: jest.fn(),
            dispose: jest.fn(),
            setTitle: jest.fn(),
        });

        const cut = new DockviewPanel(
            'fake-id',
            'fake-component',
            undefined,
            accessor,
            api,
            group,
            model,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        let latestTitle: string | undefined = undefined;

        const disposable = cut.api.onDidTitleChange((event) => {
            latestTitle = event.title;
        });

        expect(cut.title).toBeUndefined();

        cut.init({ title: 'new title', params: {} });
        expect(latestTitle).toBe('new title');
        expect(cut.title).toBe('new title');

        cut.setTitle('another title');
        expect(latestTitle).toBe('another title');
        expect(cut.title).toBe('another title');

        disposable.dispose();
    });

    test('that .setTitle updates the title', () => {
        const api = fromPartial<DockviewApi>({});
        const accessor = fromPartial<DockviewComponent>({});
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                onDidActiveChange: jest.fn(),
            },
        });
        const model = fromPartial<IDockviewPanelModel>({
            update: jest.fn(),
            init: jest.fn(),
            setTitle: jest.fn(),
        });

        const cut = new DockviewPanel(
            'fake-id',
            'fake-component',
            undefined,
            accessor,
            api,
            group,
            model,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        cut.init({ title: 'myTitle', params: {} });
        expect(cut.title).toBe('myTitle');

        cut.setTitle('newTitle');
        expect(cut.title).toBe('newTitle');

        cut.api.setTitle('new title 2');
        expect(cut.title).toBe('new title 2');
    });

    test('dispose cleanup', () => {
        const api = fromPartial<DockviewApi>({});
        const accessor = fromPartial<DockviewComponent>({});
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                onDidLocationChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                onDidActiveChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
            },
        });
        const model = fromPartial<IDockviewPanelModel>({
            update: jest.fn(),
            init: jest.fn(),
            dispose: jest.fn(),
            setTitle: jest.fn(),
        });

        const cut = new DockviewPanel(
            'fake-id',
            'fake-component',
            undefined,
            accessor,
            api,
            group,
            model,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        cut.init({ params: {}, title: 'title' });

        cut.dispose();

        expect(model.dispose).toHaveBeenCalled();
    });

    test('get params', () => {
        const api = fromPartial<DockviewApi>({});
        const accessor = fromPartial<DockviewComponent>({});
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                onDidActiveChange: jest.fn(),
            },
        });
        const model = fromPartial<IDockviewPanelModel>({
            update: jest.fn(),
            init: jest.fn(),
            dispose: jest.fn(),
            setTitle: jest.fn(),
        });

        const cut = new DockviewPanel(
            'fake-id',
            'fake-component',
            undefined,
            accessor,
            api,
            group,
            model,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        expect(cut.params).toBeUndefined();

        cut.update({ params: { variableA: 'A', variableB: 'B' } });

        expect(cut.params).toEqual({ variableA: 'A', variableB: 'B' });
    });

    test('setSize propagates to underlying group', () => {
        const api = fromPartial<DockviewApi>({});
        const accessor = fromPartial<DockviewComponent>({});
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                onDidActiveChange: jest.fn(),
                setSize: jest.fn(),
            },
        });
        const model = fromPartial<IDockviewPanelModel>({
            update: jest.fn(),
            init: jest.fn(),
            dispose: jest.fn(),
            setTitle: jest.fn(),
        });

        const cut = new DockviewPanel(
            'fake-id',
            'fake-component',
            undefined,
            accessor,
            api,
            group,
            model,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        cut.api.setSize({ height: 123, width: 456 });

        expect(group.api.setSize).toHaveBeenCalledWith({
            height: 123,
            width: 456,
        });
        expect(group.api.setSize).toHaveBeenCalledTimes(1);
    });

    test('updateParameter', () => {
        const api = fromPartial<DockviewApi>({});
        const accessor = fromPartial<DockviewComponent>({});
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                onDidActiveChange: jest.fn(),
            },
        });
        const model = fromPartial<IDockviewPanelModel>({
            update: jest.fn(),
            init: jest.fn(),
            dispose: jest.fn(),
            setTitle: jest.fn(),
        });

        const cut = new DockviewPanel(
            'fake-id',
            'fake-component',
            undefined,
            accessor,
            api,
            group,
            model,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        cut.init({ params: { a: '1', b: '2' }, title: 'A title' });
        expect(cut.params).toEqual({ a: '1', b: '2' });

        cut.update({ params: { a: '-1', c: '3' } });
        expect(cut.params).toEqual({ a: '-1', b: '2', c: '3' });
        expect(model.update).toHaveBeenCalledWith({
            params: { a: '-1', b: '2', c: '3' },
        });

        cut.update({ params: { d: '4', e: '5', f: '6' } });
        expect(cut.params).toEqual({
            a: '-1',
            b: '2',
            c: '3',
            d: '4',
            e: '5',
            f: '6',
        });
        expect(model.update).toHaveBeenCalledWith({
            params: { a: '-1', b: '2', c: '3', d: '4', e: '5', f: '6' },
        });

        cut.update({
            params: {
                d: '',
                e: null,
                f: undefined,
                g: '',
                h: null,
                i: undefined,
            },
        });
        expect(cut.params).toEqual({
            a: '-1',
            b: '2',
            c: '3',
            d: '',
            e: null,
            g: '',
            h: null,
        });
        expect(model.update).toHaveBeenCalledWith({
            params: { a: '-1', b: '2', c: '3', d: '', e: null, g: '', h: null },
        });
    });
});
