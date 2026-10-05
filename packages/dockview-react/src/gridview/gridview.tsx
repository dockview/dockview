import React from 'react';
import {
    GridviewPanelApi,
    GridviewApi,
    createGridview,
    GridviewOptions,
    PROPERTY_KEYS_GRIDVIEW,
    GridviewComponentOptions,
    GridviewFrameworkOptions,
} from 'dockview';
import { ReactGridPanelView } from './view';
import {
    useAppliedOptions,
    useKeptInstance,
    usePortalsLifecycle,
} from '../react';
import { PanelParameters } from '../types';

export interface GridviewReadyEvent {
    api: GridviewApi;
}

export interface IGridviewPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: GridviewPanelApi;
    containerApi: GridviewApi;
}

export interface IGridviewReactProps extends GridviewOptions {
    onReady: (event: GridviewReadyEvent) => void;
    components: Record<string, React.FunctionComponent<IGridviewPanelProps>>;
}

function extractCoreOptions(props: IGridviewReactProps): GridviewOptions {
    const coreOptions = PROPERTY_KEYS_GRIDVIEW.reduce(
        (obj, key) => {
            if (key in props) {
                obj[key] = props[key] as any;
            }
            return obj;
        },
        {} as Partial<GridviewComponentOptions>
    );

    return coreOptions as GridviewOptions;
}

export const GridviewReact = React.forwardRef(
    (props: IGridviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const gridviewRef = React.useRef<GridviewApi | undefined>(undefined);
        const [portals, addPortal] = usePortalsLifecycle();
        const isApplied = useAppliedOptions(gridviewRef);

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<IGridviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<GridviewOptions> = {};

                PROPERTY_KEYS_GRIDVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (gridviewRef.current && Object.keys(changes).length > 0) {
                    gridviewRef.current.updateOptions(changes);
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_GRIDVIEW.map((key) => props[key])
        );

        useKeptInstance(domRef, gridviewRef, (element) => {
            const frameworkOptions: GridviewFrameworkOptions = {
                createComponent: (options) => {
                    return new ReactGridPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            };

            const api = createGridview(element, {
                ...extractCoreOptions(props),
                ...frameworkOptions,
            });

            const { clientWidth, clientHeight } = element;
            api.layout(clientWidth, clientHeight);

            if (props.onReady) {
                props.onReady({ api });
            }

            return api;
        });

        React.useEffect(() => {
            if (
                !gridviewRef.current ||
                isApplied({ components: props.components })
            ) {
                return;
            }
            gridviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new ReactGridPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.components]);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
GridviewReact.displayName = 'GridviewComponent';
