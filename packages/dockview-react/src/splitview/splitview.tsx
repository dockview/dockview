import React from 'react';
import {
    SplitviewApi,
    SplitviewPanelApi,
    createSplitview,
    SplitviewOptions,
    PROPERTY_KEYS_SPLITVIEW,
    SplitviewFrameworkOptions,
    SplitviewComponentOptions,
} from 'dockview';
import {
    useAppliedOptions,
    useKeptInstance,
    usePortalsLifecycle,
} from '../react';
import { PanelParameters } from '../types';
import { ReactPanelView } from './view';

export interface SplitviewReadyEvent {
    api: SplitviewApi;
}

export interface ISplitviewPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: SplitviewPanelApi;
    containerApi: SplitviewApi;
}

export interface ISplitviewReactProps extends SplitviewOptions {
    onReady: (event: SplitviewReadyEvent) => void;
    components: Record<string, React.FunctionComponent<ISplitviewPanelProps>>;
}

function extractCoreOptions(props: ISplitviewReactProps): SplitviewOptions {
    const coreOptions = PROPERTY_KEYS_SPLITVIEW.reduce(
        (obj, key) => {
            if (key in props) {
                obj[key] = props[key] as any;
            }
            return obj;
        },
        {} as Partial<SplitviewComponentOptions>
    );

    return coreOptions as SplitviewOptions;
}

export const SplitviewReact = React.forwardRef(
    (props: ISplitviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const splitviewRef = React.useRef<SplitviewApi | undefined>(undefined);
        const [portals, addPortal] = usePortalsLifecycle();
        const isApplied = useAppliedOptions(splitviewRef);

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<ISplitviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<SplitviewOptions> = {};

                PROPERTY_KEYS_SPLITVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (splitviewRef.current && Object.keys(changes).length > 0) {
                    splitviewRef.current.updateOptions(changes);
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_SPLITVIEW.map((key) => props[key])
        );

        useKeptInstance(domRef, splitviewRef, (element) => {
            const frameworkOptions: SplitviewFrameworkOptions = {
                createComponent: (options) => {
                    return new ReactPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            };

            const api = createSplitview(element, {
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
                !splitviewRef.current ||
                isApplied({ components: props.components })
            ) {
                return;
            }
            splitviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new ReactPanelView(
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
SplitviewReact.displayName = 'SplitviewComponent';
