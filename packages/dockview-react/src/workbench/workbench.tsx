import {
    type DockviewComponentOptions,
    type GridviewApi,
    type GridviewPanelApi,
    type IDockviewPanelProps,
    type SideBarPosition,
    type WorkbenchActivityBarOptions,
    type WorkbenchApi,
    type WorkbenchBandOptions,
    type WorkbenchPanelOptions,
    type WorkbenchSideBarOptions,
    createWorkbench,
} from 'dockview';
import React from 'react';
import { ReactPanelContentPart } from '../dockview/reactContentPart';
import { ReactGridPanelView } from '../gridview/view';
import { usePortalsLifecycle } from '../react';
import type { PanelParameters } from '../types';

export interface WorkbenchReadyEvent {
    api: WorkbenchApi;
}

/**
 * Props for a chrome-band / side-bar / tool-panel React component. These render
 * as panels in the workbench's outer gridview, so they receive a
 * {@link GridviewPanelApi} and the outer grid's {@link GridviewApi}.
 */
export interface IWorkbenchPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: GridviewPanelApi;
    containerApi: GridviewApi;
}

export interface IWorkbenchReactProps {
    onReady: (event: WorkbenchReadyEvent) => void;
    /**
     * Components for the chrome bands, side bars and tool panel (header,
     * toolbar, status bar, activity bar, primary/secondary side bars, panel).
     */
    components: Record<string, React.FunctionComponent<IWorkbenchPanelProps>>;
    /** Components for the editor area (rendered inside the embedded dockview). */
    editorComponents: Record<
        string,
        React.FunctionComponent<IDockviewPanelProps>
    >;
    /** Extra dockview options for the editor (theme, dnd, etc.). */
    editorProps?: Omit<DockviewComponentOptions, 'createComponent'>;

    header?: WorkbenchBandOptions;
    toolbar?: WorkbenchBandOptions;
    statusBar?: WorkbenchBandOptions;
    activityBar?: WorkbenchActivityBarOptions;
    primarySideBar?: WorkbenchSideBarOptions;
    secondarySideBar?: WorkbenchSideBarOptions;
    panel?: WorkbenchPanelOptions;
    primarySideBarPosition?: SideBarPosition;
    activeViewContainer?: string;
    className?: string;
}

export const WorkbenchReact = React.forwardRef(
    (props: IWorkbenchReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const workbenchRef = React.useRef<WorkbenchApi | undefined>(undefined);
        const [portals, addPortal] = usePortalsLifecycle();

        React.useImperativeHandle(ref, () => domRef.current!, []);

        // Keep the latest component maps available to the (stable) factories so
        // that swapping a component definition takes effect on the next render
        // without tearing down the workbench.
        const latest = React.useRef(props);
        latest.current = props;

        React.useEffect(() => {
            if (!domRef.current) {
                return () => {
                    // noop
                };
            }

            const api = createWorkbench(domRef.current, {
                header: props.header,
                toolbar: props.toolbar,
                statusBar: props.statusBar,
                activityBar: props.activityBar,
                primarySideBar: props.primarySideBar,
                secondarySideBar: props.secondarySideBar,
                panel: props.panel,
                primarySideBarPosition: props.primarySideBarPosition,
                activeViewContainer: props.activeViewContainer,
                className: props.className,
                createComponent: (options) =>
                    new ReactGridPanelView(
                        options.id,
                        options.name,
                        latest.current.components[options.name],
                        { addPortal }
                    ),
                dockview: {
                    ...(props.editorProps ?? {}),
                    createComponent: (options) =>
                        new ReactPanelContentPart(
                            options.id,
                            latest.current.editorComponents[options.name],
                            { addPortal }
                        ),
                },
            });

            const { clientWidth, clientHeight } = domRef.current;
            api.layout(clientWidth, clientHeight);

            props.onReady?.({ api });

            workbenchRef.current = api;

            return () => {
                workbenchRef.current = undefined;
                api.dispose();
            };
        }, []);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
WorkbenchReact.displayName = 'WorkbenchComponent';
