import { DockviewComponent } from '../../dockview/dockviewComponent';
import { AllModules } from '../../dockview/allModules';
import { DockviewModule, IPanelStateContributor } from '../../dockview/modules';
import { IDockviewPanel } from '../../dockview/dockviewPanel';
import {
    GroupPanelPartInitParameters,
    IContentRenderer,
    SerializedDockview,
} from '../../dockview/types';
import { PanelUpdateEvent } from '../../panel/types';
import { Emitter } from '../../events';

/**
 * `moduleState` is the seam that lets a module own a slice of each panel's
 * serialized state without core carrying a field on its behalf (as it still
 * does for the legacy `pinned` flag).
 *
 * The behaviour that matters most here is the pass-through of slices whose
 * module is not registered: loading a layout in a build without that module
 * and re-saving must not silently discard the state.
 */

class ContentPart implements IContentRenderer {
    element: HTMLElement = document.createElement('div');
    readonly _onDidDispose = new Emitter<void>();
    readonly onDidDispose = this._onDidDispose.event;

    constructor(
        public readonly id: string,
        public readonly component: string
    ) {}

    init(_parameters: GroupPanelPartInitParameters): void {
        // noop
    }
    layout(_width: number, _height: number): void {
        // noop
    }
    update(_event: PanelUpdateEvent): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

interface ChannelSlice {
    channel: string;
}

/** Stand-in for the eventual channel service. */
class TestChannelService implements IPanelStateContributor<ChannelSlice> {
    readonly panelStateKey = 'testChannel';

    private readonly _channels = new Map<string, string>();
    /** Every hydrate call, so replace-semantics can be asserted. */
    readonly hydrateCalls: Array<[string, ChannelSlice | undefined]> = [];

    set(panelId: string, channel: string | undefined): void {
        if (channel === undefined) {
            this._channels.delete(panelId);
        } else {
            this._channels.set(panelId, channel);
        }
    }

    get(panelId: string): string | undefined {
        return this._channels.get(panelId);
    }

    serializePanelState(panel: IDockviewPanel): ChannelSlice | undefined {
        const channel = this._channels.get(panel.id);
        return channel === undefined ? undefined : { channel };
    }

    hydratePanelState(
        panel: IDockviewPanel,
        state: ChannelSlice | undefined
    ): void {
        this.hydrateCalls.push([panel.id, state]);
        this.set(panel.id, state?.channel);
    }
}

function moduleFor(
    service: unknown,
    serviceKey = 'testChannelService'
): DockviewModule<unknown> {
    return {
        moduleName: `TestModule:${serviceKey}`,
        services: { [serviceKey]: () => service },
    };
}

function createComponent(extraModules: DockviewModule<unknown>[] = []) {
    const container = document.createElement('div');
    const dv = new DockviewComponent(container, {
        createComponent(options) {
            return new ContentPart(options.id, options.name);
        },
        // internal seam: see moduleRemovability.spec
        modules: [...AllModules, ...extraModules],
    } as never);
    dv.layout(1000, 1000);
    return dv;
}

/** What actually lands on disk - `undefined` values do not survive. */
function serialize(dv: DockviewComponent): SerializedDockview {
    return JSON.parse(JSON.stringify(dv.toJSON()));
}

describe('panel moduleState', () => {
    test('is absent from saved layouts when no module contributes', () => {
        const dv = createComponent();
        dv.addPanel({ id: 'panel1', component: 'default' });

        const state = serialize(dv);

        expect(state.panels['panel1']).not.toHaveProperty('moduleState');
    });

    test('round-trips a contributor slice', () => {
        const service = new TestChannelService();
        const dv = createComponent([moduleFor(service)]);
        dv.addPanel({ id: 'panel1', component: 'default' });
        service.set('panel1', 'red');

        const state = serialize(dv);
        expect(state.panels['panel1'].moduleState).toEqual({
            testChannel: { channel: 'red' },
        });

        const service2 = new TestChannelService();
        const dv2 = createComponent([moduleFor(service2)]);
        dv2.fromJSON(state);

        expect(service2.get('panel1')).toBe('red');
    });

    test('preserves slices owned by a module that is not registered', () => {
        // Saved by a build that had the module...
        const service = new TestChannelService();
        const dv = createComponent([moduleFor(service)]);
        dv.addPanel({ id: 'panel1', component: 'default' });
        service.set('panel1', 'red');
        const saved = serialize(dv);

        // ...re-opened and re-saved by a build that does not.
        const stripped = createComponent();
        stripped.fromJSON(saved);
        const resaved = serialize(stripped);

        expect(resaved.panels['panel1'].moduleState).toEqual({
            testChannel: { channel: 'red' },
        });

        // and the state is still live for a build that has the module again
        const service2 = new TestChannelService();
        const dv2 = createComponent([moduleFor(service2)]);
        dv2.fromJSON(resaved);
        expect(service2.get('panel1')).toBe('red');
    });

    test('a registered contributor returning undefined drops its key', () => {
        const service = new TestChannelService();
        const dv = createComponent([moduleFor(service)]);
        dv.addPanel({ id: 'panel1', component: 'default' });
        service.set('panel1', 'red');
        expect(serialize(dv).panels['panel1'].moduleState).toBeDefined();

        // clearing must actually clear, not resurrect the loaded value
        service.set('panel1', undefined);

        expect(serialize(dv).panels['panel1']).not.toHaveProperty(
            'moduleState'
        );
    });

    test('an unclaimed key survives alongside a claimed one', () => {
        const service = new TestChannelService();
        const dv = createComponent([moduleFor(service)]);
        dv.addPanel({ id: 'panel1', component: 'default' });
        service.set('panel1', 'red');
        const saved = serialize(dv);
        saved.panels['panel1'].moduleState = {
            ...saved.panels['panel1'].moduleState,
            someOtherModule: { value: 42 },
        };

        const service2 = new TestChannelService();
        const dv2 = createComponent([moduleFor(service2)]);
        dv2.fromJSON(saved);
        service2.set('panel1', 'blue');

        expect(serialize(dv2).panels['panel1'].moduleState).toEqual({
            testChannel: { channel: 'blue' },
            someOtherModule: { value: 42 },
        });
    });

    test('hydration replaces rather than merges when panels are reused', () => {
        const service = new TestChannelService();
        const dv = createComponent([moduleFor(service)]);
        dv.addPanel({ id: 'panel1', component: 'default' });
        service.set('panel1', 'red');
        const withChannel = serialize(dv);

        // a layout saved before the panel joined a channel
        const withoutChannel = JSON.parse(
            JSON.stringify(withChannel)
        ) as SerializedDockview;
        delete withoutChannel.panels['panel1'].moduleState;

        service.hydrateCalls.length = 0;
        dv.fromJSON(withoutChannel, { reuseExistingPanels: true });

        expect(service.hydrateCalls).toContainEqual(['panel1', undefined]);
        expect(service.get('panel1')).toBeUndefined();
    });

    test('two modules claiming one key is a construction-time error', () => {
        const dv = createComponent([
            moduleFor(new TestChannelService(), 'serviceA'),
            moduleFor(new TestChannelService(), 'serviceB'),
        ]);

        expect(() => dv.panelStateContributors).toThrow(
            /duplicate panel state key 'testChannel'/
        );
    });
});
