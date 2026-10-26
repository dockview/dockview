import { DockviewFrameworkOptions } from '../../dockview/options';

export type TrackedRendererKind =
    | 'content'
    | 'tab'
    | 'watermark'
    | 'headerAction'
    | 'contextMenuItem';

const KINDS: TrackedRendererKind[] = [
    'content',
    'tab',
    'watermark',
    'headerAction',
    'contextMenuItem',
];

export interface RendererTracker {
    /** Tracked renderer factories to spread into the component options. */
    readonly options: Required<
        Pick<
            DockviewFrameworkOptions,
            | 'defaultTabComponent'
            | 'createComponent'
            | 'createTabComponent'
            | 'createWatermarkComponent'
            | 'createRightHeaderActionComponent'
            | 'createContextMenuItemComponent'
        >
    >;
    /** Renderers created and not yet disposed, for one kind or all kinds. */
    alive(kind?: TrackedRendererKind): number;
    /** Renderers created so far, for one kind or all kinds. */
    created(kind?: TrackedRendererKind): number;
    snapshot(): Record<TrackedRendererKind, number>;
}

/**
 * Counts the framework renderers a dockview creates and disposes.
 */
export function createRendererTracker(): RendererTracker {
    const alive = new Map<TrackedRendererKind, Set<number>>(
        KINDS.map((kind) => [kind, new Set<number>()])
    );
    const created = new Map<TrackedRendererKind, number>(
        KINDS.map((kind) => [kind, 0])
    );
    let nextId = 0;

    const track = (kind: TrackedRendererKind) => {
        const id = ++nextId;
        alive.get(kind)!.add(id);
        created.set(kind, created.get(kind)! + 1);
        const element = document.createElement('div');
        element.dataset.trackedRenderer = kind;
        return {
            element,
            init: () => {
                /* noop */
            },
            update: () => {
                /* noop */
            },
            dispose: () => {
                alive.get(kind)!.delete(id);
            },
        };
    };

    const count = (
        source: (kind: TrackedRendererKind) => number,
        kind?: TrackedRendererKind
    ) =>
        kind ? source(kind) : KINDS.reduce((total, k) => total + source(k), 0);

    return {
        options: {
            defaultTabComponent: 'tracked',
            createComponent: () => track('content'),
            createTabComponent: () => track('tab'),
            createWatermarkComponent: () => track('watermark'),
            createRightHeaderActionComponent: () => track('headerAction'),
            createContextMenuItemComponent: () => track('contextMenuItem'),
        },
        alive: (kind) => count((k) => alive.get(k)!.size, kind),
        created: (kind) => count((k) => created.get(k)!, kind),
        snapshot: () =>
            Object.fromEntries(
                KINDS.map((kind) => [kind, alive.get(kind)!.size])
            ) as Record<TrackedRendererKind, number>,
    };
}
