import {
    DockviewComponent,
    EDGE_GROUP_DOCK_BAND,
    IContentRenderer,
} from 'dockview';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

/**
 * Core gates the widened root activation band on the two-band drag-reveal
 * affordance being registered, so free builds don't get a bigger grid-split
 * trigger for a feature they don't have.
 *
 * The gate has a trap: `RootDropTargetService` resolves the band in its own
 * constructor, during module initialisation, and core's modules initialise
 * before this package's, so at that moment `hasEdgeDragReveal` is *always*
 * false, however the component is configured. A naive gate would therefore
 * collapse the band to the default for paying users too. Core defers the
 * re-resolve to the module's `init` (postConstruct); this test is what proves
 * that deferral works. Without it the gate silently breaks the affordance it
 * exists to serve.
 *
 * `src/__tests__/registerModules.ts` registers every enterprise module globally,
 * so a plain component here is an enterprise build.
 */
describe('edge drag-reveal activation band', () => {
    const DEFAULT_ACTIVATION = 10;
    // EDGE_GROUP_DOCK_BAND doubled: an outer "dock as edge group" sub-band and
    // an inner "split the grid" one of the same depth.
    const WIDENED_ACTIVATION = 2 * EDGE_GROUP_DOCK_BAND;

    const built: DockviewComponent[] = [];

    afterEach(() => {
        for (const dv of built.splice(0)) {
            dv.dispose();
        }
    });

    function build(options: Record<string, unknown>): DockviewComponent {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const dv = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...options,
        } as never);
        dv.layout(1000, 800);
        built.push(dv);
        return dv;
    }

    function activationSize(dv: DockviewComponent): unknown {
        const svc = (dv as never as { _rootDropTargetService: unknown })
            ._rootDropTargetService as {
            _html5Target: {
                options: {
                    overlayModel?: { activationSize?: { value?: number } };
                };
            };
        };
        return svc._html5Target.options.overlayModel?.activationSize?.value;
    }

    test('widens for dockToEdgeGroups when the affordance is registered', () => {
        expect(activationSize(build({ dockToEdgeGroups: true }))).toBe(
            WIDENED_ACTIVATION
        );
    });

    test('stays default when the option is off, affordance or not', () => {
        expect(activationSize(build({}))).toBe(DEFAULT_ACTIVATION);
        expect(activationSize(build({ dockToEdgeGroups: false }))).toBe(
            DEFAULT_ACTIVATION
        );
    });

    test('widens for a per-edge set too', () => {
        expect(
            activationSize(build({ dockToEdgeGroups: { left: true } }))
        ).toBe(WIDENED_ACTIVATION);
    });

    test('tracks a late updateOptions', () => {
        const dv = build({});
        expect(activationSize(dv)).toBe(DEFAULT_ACTIVATION);

        dv.updateOptions({ dockToEdgeGroups: true });
        expect(activationSize(dv)).toBe(WIDENED_ACTIVATION);

        dv.updateOptions({ dockToEdgeGroups: false });
        expect(activationSize(dv)).toBe(DEFAULT_ACTIVATION);
    });
});
