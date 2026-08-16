import { act, render, waitFor } from '@testing-library/react';
import type {
    DockviewApi,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import React from 'react';
import {
    DockviewReact,
    type IWorkbenchPanelProps,
} from '../../dockview/dockview';

describe('workbench react', () => {
    let components: Record<
        string,
        React.FunctionComponent<IDockviewPanelProps>
    >;
    let workbenchComponents: Record<
        string,
        React.FunctionComponent<IWorkbenchPanelProps>
    >;

    beforeEach(() => {
        components = {
            editor: (props: IDockviewPanelProps) => (
                <div>{`editor-${props.api.id}`}</div>
            ),
        };
        workbenchComponents = {
            header: () => <div>header-band</div>,
            explorer: () => <div>explorer-view</div>,
            terminal: () => <div>terminal-view</div>,
        };
    });

    test('creates a dockview exposing a workbench api', () => {
        let api: DockviewApi | undefined;

        render(
            <DockviewReact
                components={components}
                workbench={{
                    components: workbenchComponents,
                    header: { component: 'header' },
                    primarySideBar: { component: 'explorer' },
                    toolPanel: { component: 'terminal' },
                }}
                onReady={(event: DockviewReadyEvent) => {
                    api = event.api;
                }}
            />
        );

        expect(api).toBeTruthy();
        expect(api!.workbench).toBeTruthy();
    });

    test('renders band, side bar and editor react components', async () => {
        let api: DockviewApi | undefined;

        const wrapper = render(
            <DockviewReact
                components={components}
                workbench={{
                    components: workbenchComponents,
                    header: { component: 'header' },
                    primarySideBar: { component: 'explorer' },
                    toolPanel: { component: 'terminal' },
                }}
                onReady={(event: DockviewReadyEvent) => {
                    api = event.api;
                }}
            />
        );

        act(() => {
            api!.addPanel({ id: 'p1', component: 'editor' });
        });

        await waitFor(() => {
            expect(wrapper.getByText('header-band')).toBeTruthy();
        });
        await waitFor(() => {
            expect(wrapper.getByText('explorer-view')).toBeTruthy();
        });
        await waitFor(() => {
            expect(wrapper.getByText('terminal-view')).toBeTruthy();
        });
        await waitFor(() => {
            expect(wrapper.getByText('editor-p1')).toBeTruthy();
        });
    });

    test('exposes workbench layout controls on api.workbench', () => {
        let api: DockviewApi | undefined;

        render(
            <DockviewReact
                components={components}
                workbench={{
                    components: workbenchComponents,
                    activityBar: { component: 'header' },
                    primarySideBar: { component: 'explorer' },
                    secondarySideBar: { component: 'explorer' },
                }}
                onReady={(event: DockviewReadyEvent) => {
                    api = event.api;
                }}
            />
        );

        expect(api!.workbench!.primarySideBarPosition).toBe('left');
        act(() => {
            api!.workbench!.setPrimarySideBarPosition('right');
        });
        expect(api!.workbench!.primarySideBarPosition).toBe('right');
    });
});
