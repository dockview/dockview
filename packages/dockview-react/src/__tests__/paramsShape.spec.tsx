import React from 'react';
import { act, render } from '@testing-library/react';
import { GridviewApi, PaneviewApi, SplitviewApi } from 'dockview';
import { SplitviewReact, ISplitviewPanelProps } from '../splitview/splitview';
import { GridviewReact, IGridviewPanelProps } from '../gridview/gridview';
import { PaneviewReact, IPaneviewPanelProps } from '../paneview/paneview';

/**
 * User `params` must only ever arrive under the `params` prop. A param named
 * like a real prop (`api`, `title`) must not clobber it, and no param key may
 * leak onto the component as a top-level prop, on initial render, after
 * `updateParameters`, or after a layout.
 */
describe('params are delivered under the params prop only', () => {
    const SplitProbe = (props: ISplitviewPanelProps) => (
        <div data-testid="probe">
            {`api.id=${String(props.api.id)}|params.api=${String(
                props.params.api
            )}|leaked=${String((props as Record<string, unknown>).foo)}`}
        </div>
    );

    test('splitview', () => {
        let api: SplitviewApi | undefined;
        const wrapper = render(
            <SplitviewReact
                components={{ probe: SplitProbe }}
                onReady={(e) => {
                    api = e.api;
                }}
            />
        );
        act(() => api!.layout(500, 500));
        act(() => {
            api!.addPanel({
                id: 'p1',
                component: 'probe',
                params: { api: 'NOT_AN_API', foo: 'LEAK' },
            });
        });
        const expected = 'api.id=p1|params.api=NOT_AN_API|leaked=undefined';
        expect(wrapper.getByTestId('probe').textContent).toBe(expected);

        act(() => api!.layout(600, 600));
        expect(wrapper.getByTestId('probe').textContent).toBe(expected);

        act(() => api!.getPanel('p1')!.api.updateParameters({ bar: 1 }));
        expect(wrapper.getByTestId('probe').textContent).toBe(expected);
    });

    test('gridview', () => {
        let api: GridviewApi | undefined;
        const wrapper = render(
            <GridviewReact
                components={{
                    probe: SplitProbe as React.FunctionComponent<IGridviewPanelProps>,
                }}
                onReady={(e) => {
                    api = e.api;
                }}
            />
        );
        act(() => api!.layout(500, 500));
        act(() => {
            api!.addPanel({
                id: 'p1',
                component: 'probe',
                params: { api: 'NOT_AN_API', foo: 'LEAK' },
            });
        });
        const expected = 'api.id=p1|params.api=NOT_AN_API|leaked=undefined';
        expect(wrapper.getByTestId('probe').textContent).toBe(expected);

        act(() => api!.layout(600, 600));
        expect(wrapper.getByTestId('probe').textContent).toBe(expected);
    });

    test('paneview', () => {
        const PaneProbe = (props: IPaneviewPanelProps) => (
            <div data-testid="probe">
                {`title=${String(props.title)}|params.title=${String(
                    props.params.title
                )}|api.id=${String(props.api.id)}|b=${String(
                    props.params.b
                )}|wrapped=${String('params' in props.params)}`}
            </div>
        );
        let api: PaneviewApi | undefined;
        const wrapper = render(
            <PaneviewReact
                components={{ probe: PaneProbe }}
                onReady={(e) => {
                    api = e.api;
                }}
            />
        );
        act(() => api!.layout(500, 500));
        act(() => {
            api!.addPanel({
                id: 'p1',
                component: 'probe',
                title: 'REAL',
                params: { title: 'PARAM', api: 'NOT_AN_API' },
            });
        });
        expect(wrapper.getByTestId('probe').textContent).toBe(
            'title=REAL|params.title=PARAM|api.id=p1|b=undefined|wrapped=false'
        );

        act(() => api!.layout(600, 600));
        expect(wrapper.getByTestId('probe').textContent).toBe(
            'title=REAL|params.title=PARAM|api.id=p1|b=undefined|wrapped=false'
        );

        act(() => api!.getPanel('p1')!.api.updateParameters({ b: 2 }));
        expect(wrapper.getByTestId('probe').textContent).toBe(
            'title=REAL|params.title=PARAM|api.id=p1|b=2|wrapped=false'
        );

        act(() => api!.layout(700, 700));
        expect(wrapper.getByTestId('probe').textContent).toBe(
            'title=REAL|params.title=PARAM|api.id=p1|b=2|wrapped=false'
        );
    });
});
