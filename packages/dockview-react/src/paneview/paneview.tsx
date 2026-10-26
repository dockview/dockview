import React from 'react';
import {
    PaneviewPanelApi,
    PaneviewApi,
    PaneviewDidDropEvent,
    createPaneview,
    PaneviewOptions,
    PROPERTY_KEYS_PANEVIEW,
    PaneviewComponentOptions,
    PaneviewFrameworkOptions,
} from 'dockview';
import {
    useAppliedOptions,
    useKeptInstance,
    usePortalsLifecycle,
} from '../react';
import { PanePanelSection } from './view';
import { PanelParameters } from '../types';

export interface PaneviewReadyEvent {
    api: PaneviewApi;
}

export interface IPaneviewPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: PaneviewPanelApi;
    containerApi: PaneviewApi;
    title: string;
}

export interface IPaneviewReactProps extends PaneviewOptions {
    onReady: (event: PaneviewReadyEvent) => void;
    components: Record<string, React.FunctionComponent<IPaneviewPanelProps>>;
    headerComponents?: Record<
        string,
        React.FunctionComponent<IPaneviewPanelProps>
    >;
    onDidDrop?(event: PaneviewDidDropEvent): void;
}

function extractCoreOptions(props: IPaneviewReactProps): PaneviewOptions {
    const coreOptions = PROPERTY_KEYS_PANEVIEW.reduce(
        (obj, key) => {
            if (key in props) {
                obj[key] = props[key] as any;
            }
            return obj;
        },
        {} as Partial<PaneviewComponentOptions>
    );

    return coreOptions as PaneviewOptions;
}

export const PaneviewReact = React.forwardRef(
    (props: IPaneviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const paneviewRef = React.useRef<PaneviewApi | undefined>(undefined);
        const [portals, addPortal] = usePortalsLifecycle();
        const isApplied = useAppliedOptions(paneviewRef);

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<IPaneviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<PaneviewOptions> = {};

                PROPERTY_KEYS_PANEVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (paneviewRef.current && Object.keys(changes).length > 0) {
                    paneviewRef.current.updateOptions(changes);
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_PANEVIEW.map((key) => props[key])
        );

        useKeptInstance(domRef, paneviewRef, (element) => {
            const headerComponents = props.headerComponents ?? {};

            const frameworkOptions: PaneviewFrameworkOptions = {
                createComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        props.components[options.name],
                        { addPortal }
                    );
                },
                createHeaderComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        headerComponents[options.name],
                        { addPortal }
                    );
                },
            };

            const api = createPaneview(element, {
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
                !paneviewRef.current ||
                isApplied({ components: props.components })
            ) {
                return;
            }
            paneviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.components]);

        React.useEffect(() => {
            if (
                !paneviewRef.current ||
                isApplied({ headerComponents: props.headerComponents })
            ) {
                return;
            }

            const headerComponents = props.headerComponents ?? {};

            paneviewRef.current.updateOptions({
                createHeaderComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        headerComponents[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.headerComponents]);

        React.useEffect(() => {
            if (!paneviewRef.current) {
                return () => {
                    // noop
                };
            }

            const disposable = paneviewRef.current.onDidDrop((event) => {
                if (props.onDidDrop) {
                    props.onDidDrop(event);
                }
            });

            return () => {
                disposable.dispose();
            };
        }, [props.onDidDrop]);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
PaneviewReact.displayName = 'PaneviewComponent';
