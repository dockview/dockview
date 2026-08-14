import { act, render, waitFor } from '@testing-library/react';
import type { IDockviewPanelProps, WorkbenchApi } from 'dockview';
import React from 'react';
import {
    type IWorkbenchPanelProps,
    WorkbenchReact,
    type WorkbenchReadyEvent,
} from '../../workbench/workbench';

describe('workbench react', () => {
    let components: Record<
        string,
        React.FunctionComponent<IWorkbenchPanelProps>
    >;
    let editorComponents: Record<
        string,
        React.FunctionComponent<IDockviewPanelProps>
    >;

    beforeEach(() => {
        components = {
            header: () => <div>header-band</div>,
            explorer: () => <div>explorer-view</div>,
            terminal: () => <div>terminal-view</div>,
        };
        editorComponents = {
            editor: (props: IDockviewPanelProps) => (
                <div>{`editor-${props.api.id}`}</div>
            ),
        };
    });

    test('creates a workbench exposing a dockview editor api', () => {
        let api: WorkbenchApi | undefined;

        render(
            <WorkbenchReact
                components={components}
                editorComponents={editorComponents}
                header={{ component: 'header' }}
                primarySideBar={{ component: 'explorer' }}
                panel={{ component: 'terminal' }}
                onReady={(event: WorkbenchReadyEvent) => {
                    api = event.api;
                }}
            />
        );

        expect(api).toBeTruthy();
        expect(api!.dockview).toBeTruthy();
    });

    test('renders band, side bar and editor react components', async () => {
        let api: WorkbenchApi | undefined;

        const wrapper = render(
            <WorkbenchReact
                components={components}
                editorComponents={editorComponents}
                header={{ component: 'header' }}
                primarySideBar={{ component: 'explorer' }}
                panel={{ component: 'terminal' }}
                onReady={(event: WorkbenchReadyEvent) => {
                    api = event.api;
                }}
            />
        );

        act(() => {
            api!.dockview.addPanel({ id: 'p1', component: 'editor' });
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

    test('exposes workbench layout controls on the api', () => {
        let api: WorkbenchApi | undefined;

        render(
            <WorkbenchReact
                components={components}
                editorComponents={editorComponents}
                activityBar={{ component: 'header' }}
                primarySideBar={{ component: 'explorer' }}
                secondarySideBar={{ component: 'explorer' }}
                onReady={(event: WorkbenchReadyEvent) => {
                    api = event.api;
                }}
            />
        );

        expect(api!.primarySideBarPosition).toBe('left');
        act(() => {
            api!.setPrimarySideBarPosition('right');
        });
        expect(api!.primarySideBarPosition).toBe('right');
    });
});
