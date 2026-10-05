import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import {
    type DockviewReadyEvent,
    type IDockviewPanelProps,
    Orientation,
} from 'dockview';
import { DockviewReact } from '../dockview/dockview';
import { GridviewReact } from '../gridview/gridview';
import { PaneviewReact } from '../paneview/paneview';
import { SplitviewReact } from '../splitview/splitview';

interface Disposable {
    dispose(): void;
}

type Render = (
    onReady: (event: { api: Disposable }) => void
) => React.ReactElement;

const empty = {};

const components: [string, Render][] = [
    [
        'DockviewReact',
        (onReady) => <DockviewReact components={empty} onReady={onReady} />,
    ],
    [
        'SplitviewReact',
        (onReady) => (
            <SplitviewReact
                orientation={Orientation.VERTICAL}
                components={empty}
                onReady={onReady}
            />
        ),
    ],
    [
        'GridviewReact',
        (onReady) => (
            <GridviewReact
                orientation={Orientation.VERTICAL}
                components={empty}
                onReady={onReady}
            />
        ),
    ],
    [
        'PaneviewReact',
        (onReady) => <PaneviewReact components={empty} onReady={onReady} />,
    ],
];

function Host(props: {
    mode: 'visible' | 'hidden';
    children: React.ReactElement;
}) {
    return <React.Activity mode={props.mode}>{props.children}</React.Activity>;
}

describe.each(components)('%s lifecycle', (_name, renderComponent) => {
    function setup() {
        const instances: Disposable[] = [];
        const onReady = jest.fn((event: { api: Disposable }) => {
            instances.push(event.api);
            jest.spyOn(event.api, 'dispose');
        });
        const element = renderComponent(onReady);
        return { instances, onReady, element };
    }

    test('keeps the instance across an Activity hide and reveal', () => {
        const { instances, onReady, element } = setup();

        const view = render(<Host mode="visible">{element}</Host>);
        view.rerender(<Host mode="hidden">{element}</Host>);
        view.rerender(<Host mode="visible">{element}</Host>);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(instances[0].dispose).not.toHaveBeenCalled();
    });

    test('keeps the instance across a StrictMode effect replay', () => {
        const { onReady, instances, element } = setup();

        render(<React.StrictMode>{element}</React.StrictMode>);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(instances[0].dispose).not.toHaveBeenCalled();
    });

    test('disposes the instance on unmount', () => {
        const { instances, element } = setup();

        const view = render(<Host mode="visible">{element}</Host>);
        view.unmount();

        expect(instances[0].dispose).toHaveBeenCalledTimes(1);
    });

    test('disposes the instance when removed while hidden', async () => {
        const { instances, element } = setup();

        const view = render(<Host mode="visible">{element}</Host>);
        view.rerender(<Host mode="hidden">{element}</Host>);

        expect(instances[0].dispose).not.toHaveBeenCalled();

        view.rerender(<div />);

        await waitFor(() => {
            expect(instances[0].dispose).toHaveBeenCalledTimes(1);
        });
    });

    test('follows an ancestor that moves while hidden', async () => {
        const { instances, element } = setup();

        const view = render(<Host mode="visible">{element}</Host>);
        view.rerender(<Host mode="hidden">{element}</Host>);

        const sibling = document.createElement('div');
        document.body.appendChild(sibling);
        document.body.removeChild(sibling);

        const target = document.createElement('div');
        document.body.appendChild(target);
        target.appendChild(view.container);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(instances[0].dispose).not.toHaveBeenCalled();

        target.removeChild(view.container);

        await waitFor(() => {
            expect(instances[0].dispose).toHaveBeenCalledTimes(1);
        });
        target.remove();
    });
});

describe('DockviewReact under Activity', () => {
    const Counter = () => {
        const [count, setCount] = React.useState(0);
        return (
            <button type="button" onClick={() => setCount((n) => n + 1)}>
                {`count=${count}`}
            </button>
        );
    };

    test('a panel keeps its React state across a hide and reveal', () => {
        const panelComponents: Record<
            string,
            React.FunctionComponent<IDockviewPanelProps>
        > = { counter: Counter };

        const element = (
            <DockviewReact
                components={panelComponents}
                onReady={(event) => {
                    event.api.addPanel({ id: 'panel', component: 'counter' });
                }}
            />
        );

        const view = render(<Host mode="visible">{element}</Host>);

        fireEvent.click(view.getByText('count=0'));
        expect(view.getByText('count=1')).toBeTruthy();

        view.rerender(<Host mode="hidden">{element}</Host>);
        view.rerender(<Host mode="visible">{element}</Host>);

        expect(view.getByText('count=1')).toBeTruthy();
    });

    test('does not call updateOptions on reveal when no prop changed', () => {
        let updateOptions: jest.SpyInstance | undefined;

        const panelComponents = {};
        const watermark = () => <div />;
        const headerActions = () => <div />;
        const onReady = (event: DockviewReadyEvent) => {
            updateOptions = jest.spyOn(event.api, 'updateOptions');
        };

        const renderAt = (
            mode: 'visible' | 'hidden',
            watermarkComponent = watermark
        ) => (
            <Host mode={mode}>
                <DockviewReact
                    components={panelComponents}
                    watermarkComponent={watermarkComponent}
                    rightHeaderActionsComponent={headerActions}
                    className="layout"
                    onReady={onReady}
                />
            </Host>
        );

        const view = render(renderAt('visible'));
        view.rerender(renderAt('hidden'));
        view.rerender(renderAt('visible'));

        expect(updateOptions).not.toHaveBeenCalled();

        const otherWatermark = () => <div />;
        view.rerender(renderAt('visible', otherWatermark));

        expect(updateOptions).toHaveBeenCalledTimes(1);
        expect(updateOptions).toHaveBeenCalledWith({
            createWatermarkComponent: expect.any(Function),
        });
    });
});
