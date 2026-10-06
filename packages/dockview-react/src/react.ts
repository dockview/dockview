import React from 'react';
import ReactDOM from 'react-dom';
import {
    DockviewDisposable,
    IFrameworkPart,
    DockviewIDisposable,
    Parameters,
} from 'dockview';

export interface ReactPortalStore {
    addPortal: (portal: React.ReactPortal) => DockviewIDisposable;
}

interface IPanelWrapperProps {
    component: React.FunctionComponent<{ [key: string]: any }>;
    componentProps: { [key: string]: any };
}

interface IPanelWrapperRef {
    update: (props: { [key: string]: any }) => void;
}

/**
 * This component is intended to interface between vanilla-js and React hence we need to be
 * creative in how we update props.
 * A ref of the component is exposed with an update method; which when called stores the props
 * as a ref within this component and forcefully triggers a re-render of the component using
 * the ref of props we just set on the renderered component as the props passed to the inner
 * component
 */
const ReactComponentBridge: React.ForwardRefRenderFunction<
    IPanelWrapperRef,
    IPanelWrapperProps
> = (props, ref) => {
    // Only the setter is needed (to force a re-render); the value is
    // intentionally not destructured.
    const [, triggerRender] = React.useState<number>(0);
    const _props = React.useRef<object>(props.componentProps);

    React.useImperativeHandle(
        ref,
        () => ({
            update: (componentProps: object) => {
                _props.current = { ..._props.current, ...componentProps };
                /**
                 * setting a arbitrary piece of state within this component will
                 * trigger a re-render.
                 * we use this rather than updating through a prop since we can
                 * pass a ref into the vanilla-js world.
                 *
                 * Use a monotonic counter rather than `Date.now()` so two
                 * updates within the same millisecond still produce distinct
                 * state values and avoid React's bailout.
                 */
                triggerRender((n) => n + 1);
            },
        }),
        []
    );

    return React.createElement(props.component, _props.current);
};
ReactComponentBridge.displayName = 'DockviewReactJsBridge';

/**
 * Since we are storing the React.Portal references in a rendered array they
 * require a key property like any other React element rendered in an array
 * to prevent excessive re-rendering
 */
const uniquePortalKeyGenerator = (() => {
    let value = 1;
    return { next: () => `dockview_react_portal_key_${(value++).toString()}` };
})();

export const ReactPartContext = React.createContext<{}>({});

export class ReactPart<P extends object, C extends object = {}>
    implements IFrameworkPart
{
    private _initialProps: Parameters = {};
    private componentInstance?: IPanelWrapperRef;
    private ref?: {
        portal: React.ReactPortal;
        disposable: DockviewIDisposable;
    };
    private disposed = false;

    constructor(
        private readonly parent: HTMLElement,
        private readonly portalStore: ReactPortalStore,
        private readonly component: React.FunctionComponent<P>,
        private readonly parameters: P,
        private readonly context?: C
    ) {
        this.createPortal();
    }

    public update(props: { [index: string]: any }) {
        if (this.disposed) {
            throw new Error('invalid operation: resource is already disposed');
        }

        if (this.componentInstance) {
            this.componentInstance.update(props);
        } else {
            // if the component is yet to be mounted store the props
            this._initialProps = { ...this._initialProps, ...props };
        }
    }

    private createPortal() {
        if (this.disposed) {
            throw new Error('invalid operation: resource is already disposed');
        }

        if (!isReactComponent(this.component)) {
            /**
             * we know this isn't a React.FunctionComponent so throw an error here.
             * if we do not intercept then React library will throw a very obsure error
             * for the same reason... at least at this point we will emit a sensible stacktrace.
             */
            throw new Error(
                'Dockview: Only React.memo(...), React.ForwardRef(...) and functional components are accepted as components'
            );
        }

        const bridgeComponent = React.createElement(
            React.forwardRef(ReactComponentBridge),
            {
                component: this
                    .component as unknown as React.FunctionComponent<{}>,
                componentProps: this.parameters as unknown as {},
                ref: (element: IPanelWrapperRef) => {
                    this.componentInstance = element;

                    if (Object.keys(this._initialProps).length > 0) {
                        this.componentInstance.update(this._initialProps);
                        this._initialProps = {}; // don't keep a reference to the users object once no longer required
                    }
                },
            }
        );

        const node = this.context
            ? React.createElement(
                  ReactPartContext.Provider,
                  { value: this.context },
                  bridgeComponent
              )
            : bridgeComponent;

        const portal = ReactDOM.createPortal(
            node,
            this.parent,
            uniquePortalKeyGenerator.next()
        );

        this.ref = {
            portal,
            disposable: this.portalStore.addPortal(portal),
        };
    }

    public dispose() {
        this.ref?.disposable.dispose();
        this.disposed = true;
    }
}

type PortalLifecycleHook = () => [
    React.ReactPortal[],
    (portal: React.ReactPortal) => DockviewIDisposable,
];

/**
 * A React Hook that returns an array of portals to be rendered by the user of this hook
 * and a disposable function to add a portal. Calling dispose removes this portal from the
 * portal array
 */
export const usePortalsLifecycle: PortalLifecycleHook = () => {
    const [portals, setPortals] = React.useState<React.ReactPortal[]>([]);

    React.useDebugValue(`Portal count: ${portals.length}`);

    const addPortal = React.useCallback((portal: React.ReactPortal) => {
        setPortals((existingPortals) => [...existingPortals, portal]);
        let disposed = false;
        return DockviewDisposable.from(() => {
            if (disposed) {
                throw new Error('invalid operation: resource already disposed');
            }
            disposed = true;
            setPortals((existingPortals) =>
                existingPortals.filter((p) => p !== portal)
            );
        });
    }, []);

    return [portals, addPortal];
};

export function isReactComponent(component: any): boolean {
    /**
     * Yes, we could use "react-is" but that would introduce an unwanted peer dependency
     * so for now we will check in a rather crude fashion...
     */
    return (
        typeof component === 'function' /** Functional Componnts */ ||
        !!(component as React.ExoticComponent)
            ?.$$typeof /** React.memo(...) Components */
    );
}

/**
 * Calls `onRemoved` once `element` leaves the document. Only its ancestors are
 * observed, since any removal above it is a child-list change on one of them.
 */
function watchForRemoval(
    element: HTMLElement,
    onRemoved: () => void
): DockviewIDisposable {
    const parentOf = (node: Node): Node | null =>
        node instanceof ShadowRoot ? node.host : node.parentNode;

    const ancestors = new Set<Node>();

    const observer = new MutationObserver((records) => {
        if (!element.isConnected) {
            observer.disconnect();
            onRemoved();
            return;
        }

        // re-walk only if an ancestor moved
        for (const record of records) {
            for (const node of record.removedNodes) {
                if (ancestors.has(node)) {
                    observeAncestors();
                    return;
                }
            }
        }
    });

    const observeAncestors = () => {
        observer.disconnect();
        ancestors.clear();
        for (let node = parentOf(element); node; node = parentOf(node)) {
            ancestors.add(node);
            observer.observe(node, { childList: true });
        }
    };

    observeAncestors();

    return DockviewDisposable.from(() => observer.disconnect());
}

// only React 18+ runs effect cleanups without unmounting (Activity, StrictMode)
const canHideWithoutUnmount = Number.parseInt(React.version, 10) >= 18;

/**
 * Creates the instance once and keeps it across effect cleanups that are not
 * unmounts (`<Activity mode="hidden">`, StrictMode). A real unmount removes the
 * host before cleanup, so a still-connected host means hidden; the instance is
 * then disposed only if the host later leaves the document.
 */
export function useKeptInstance<T extends DockviewIDisposable>(
    domRef: React.RefObject<HTMLElement | null>,
    instanceRef: React.MutableRefObject<T | undefined>,
    create: (element: HTMLElement) => T
): void {
    const removalWatcher = React.useRef<DockviewIDisposable | undefined>(
        undefined
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: the instance is created once, from the props of the first render
    React.useEffect(() => {
        const element = domRef.current;
        if (!element) {
            return;
        }

        removalWatcher.current?.dispose();
        removalWatcher.current = undefined;

        const instance = instanceRef.current ?? create(element);
        instanceRef.current = instance;

        return () => {
            const dispose = () => {
                removalWatcher.current = undefined;
                instanceRef.current = undefined;
                instance.dispose();
            };

            if (
                canHideWithoutUnmount &&
                element.isConnected &&
                typeof MutationObserver !== 'undefined'
            ) {
                removalWatcher.current = watchForRemoval(element, dispose);
            } else {
                dispose();
            }
        };
    }, []);
}

/**
 * Returns a check for option effects: true when the instance already holds the
 * given values. The first values seen count as applied, since the instance was
 * created from them, so effect replays skip redundant `updateOptions` calls.
 */
export function useAppliedOptions(
    instanceRef: React.RefObject<unknown>
): (values: Record<string, unknown>) => boolean {
    const applied = React.useRef<{
        instance: unknown;
        values: Map<string, unknown>;
    }>({ instance: undefined, values: new Map() });

    return React.useCallback(
        (values: Record<string, unknown>) => {
            if (applied.current.instance !== instanceRef.current) {
                applied.current = {
                    instance: instanceRef.current,
                    values: new Map(),
                };
            }

            const known = applied.current.values;
            let unchanged = true;

            for (const [key, value] of Object.entries(values)) {
                if (known.has(key) && known.get(key) !== value) {
                    unchanged = false;
                }
                known.set(key, value);
            }

            return unchanged;
        },
        [instanceRef]
    );
}
