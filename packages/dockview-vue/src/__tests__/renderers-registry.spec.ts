import { describe, test, expect } from 'vitest';
import {
    DockviewEmitter,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    DockviewGroupPanelModel,
    IDockviewPanel,
} from 'dockview';
import {
    VueHeaderActionsRenderer,
    VueTabGroupChipRenderer,
    VueRendererRegistry,
} from '../utils';

/**
 * These exercise the teleport `VueRendererRegistry` path with the real Vue
 * runtime (no vue mock), so the registry's shallow top-level params merge is
 * observable via `registry.entries[0].props.value`.
 */
describe('registry renderers retain params across partial updates', () => {
    const mockComponent = {
        template: '<div>renderer</div>',
        props: ['params'],
    } as any;
    const mockParent = {
        appContext: { components: {}, provides: {} },
        provides: {},
    } as any;

    test('VueHeaderActionsRenderer.updateLocation keeps the enriched props', () => {
        const onDidAddPanel = new DockviewEmitter<any>();
        const onDidRemovePanel = new DockviewEmitter<any>();
        const onDidChangeTabOrder = new DockviewEmitter<any>();
        const onDidActivePanelChange = new DockviewEmitter<any>();
        const onDidActiveChange = new DockviewEmitter<any>();
        const onDidLocationChange = new DockviewEmitter<any>();

        const panels = [{ id: 'panel-1' } as IDockviewPanel];

        const groupModel = {
            onDidAddPanel: onDidAddPanel.event,
            onDidRemovePanel: onDidRemovePanel.event,
            onDidChangeTabOrder: onDidChangeTabOrder.event,
            onDidActivePanelChange: onDidActivePanelChange.event,
            get panels() {
                return panels;
            },
            get activePanel() {
                return panels[0];
            },
            headerPosition: 'top',
        } as Partial<DockviewGroupPanelModel> as DockviewGroupPanelModel;

        const groupApi = {
            onDidActiveChange: onDidActiveChange.event,
            onDidLocationChange: onDidLocationChange.event,
            location: { type: 'grid' },
            get isActive() {
                return true;
            },
        } as Partial<DockviewGroupPanelApi> as DockviewGroupPanelApi;

        const groupPanel = {
            api: groupApi,
            model: groupModel,
        } as Partial<DockviewGroupPanel> as DockviewGroupPanel;

        const registry = new VueRendererRegistry();

        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel,
            registry
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        // a location change (float/popout) must not wipe the enriched props
        onDidLocationChange.fire({ location: { type: 'floating' } });

        const params = registry.entries[0].props.value.params;
        expect(params.location).toEqual({ type: 'floating' });
        expect(params.panels).toBe(panels);
        expect(params.api).toBe(groupPanel.api);
        expect(params.group).toBe(groupPanel);

        renderer.dispose();
        onDidAddPanel.dispose();
        onDidRemovePanel.dispose();
        onDidChangeTabOrder.dispose();
        onDidActivePanelChange.dispose();
        onDidActiveChange.dispose();
        onDidLocationChange.dispose();
    });

    test('VueTabGroupChipRenderer.update keeps the api', () => {
        const registry = new VueRendererRegistry();

        const renderer = new VueTabGroupChipRenderer(
            mockComponent,
            mockParent,
            registry
        );

        const api = { id: 'container-api' } as any;

        renderer.init({ tabGroup: { id: 'g1' } as any, api });
        renderer.update({ tabGroup: { id: 'g2' } as any });

        const params = registry.entries[0].props.value.params;
        expect(params.tabGroup.id).toBe('g2');
        expect(params.api).toBe(api);

        renderer.dispose();
    });
});
