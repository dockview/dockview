import { DockviewPanelApiImpl } from '../../api/dockviewPanelApi';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewPanel } from '../../dockview/dockviewPanel';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { fromPartial } from '@total-typescript/shoehorn';
import { Emitter } from '../../events';

describe('groupPanelApi', () => {
    test('title', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest.fn(),
            // no transaction is in flight in these fixtures, so location
            // changes report straight away
            deferLocationChange: (_key: object, fire: () => void) => fire(),
        });

        const panelMock = jest.fn<DockviewPanel, []>(() => {
            return {
                update: jest.fn(),
                setTitle: jest.fn(),
            } as any;
        });

        const panel = new panelMock();
        const group = fromPartial<DockviewGroupPanel>({
            api: {
                onDidVisibilityChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                onDidActiveChange: jest.fn(),
            },
        });

        const cut = new DockviewPanelApiImpl(
            panel,
            group,
            <DockviewComponent>accessor,
            'fake-component'
        );

        cut.setTitle('test_title');
        expect(panel.setTitle).toHaveBeenCalledTimes(1);
        expect(panel.setTitle).toHaveBeenCalledWith('test_title');
    });

    test('updateParameters', () => {
        const groupPanel: Partial<DockviewPanel> = {
            id: 'test_id',
            update: jest.fn(),
        };

        const accessor = fromPartial<DockviewComponent>({
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest.fn(),
            // no transaction is in flight in these fixtures, so location
            // changes report straight away
            deferLocationChange: (_key: object, fire: () => void) => fire(),
        });

        const groupViewPanel = new DockviewGroupPanel(
            <DockviewComponent>accessor,
            '',
            {}
        );

        const cut = new DockviewPanelApiImpl(
            <DockviewPanel>groupPanel,
            <DockviewGroupPanel>groupViewPanel,
            <DockviewComponent>accessor,
            'fake-component'
        );

        cut.updateParameters({ keyA: 'valueA' });

        expect(groupPanel.update).toHaveBeenCalledWith({
            params: { keyA: 'valueA' },
        });
        expect(groupPanel.update).toHaveBeenCalledTimes(1);
    });

    test('onDidGroupChange', () => {
        const groupPanel: Partial<DockviewPanel> = {
            id: 'test_id',
        };

        const accessor = fromPartial<DockviewComponent>({
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest.fn(),
            // no transaction is in flight in these fixtures, so location
            // changes report straight away
            deferLocationChange: (_key: object, fire: () => void) => fire(),
        });

        const groupViewPanel = new DockviewGroupPanel(
            <DockviewComponent>accessor,
            '',
            {}
        );

        const cut = new DockviewPanelApiImpl(
            <DockviewPanel>groupPanel,
            <DockviewGroupPanel>groupViewPanel,
            <DockviewComponent>accessor,
            'fake-component'
        );

        let events = 0;

        const disposable = cut.onDidGroupChange(() => {
            events++;
        });

        expect(events).toBe(0);
        expect(cut.group).toBe(groupViewPanel);

        const groupViewPanel2 = new DockviewGroupPanel(
            <DockviewComponent>accessor,
            '',
            {}
        );
        cut.group = groupViewPanel2;
        expect(events).toBe(1);
        expect(cut.group).toBe(groupViewPanel2);

        disposable.dispose();
    });

    /**
     * Builds a `DockviewPanelApiImpl` backed by controllable mocks. The group's
     * event surface is wired to real `Emitter`s so tests can drive the internal
     * group-event listeners deterministically.
     */
    function createFixture(options?: {
        panel?: Partial<DockviewPanel>;
        group?: Partial<DockviewGroupPanel>;
        groupApi?: Record<string, unknown>;
        accessor?: Partial<DockviewComponent>;
        tabComponent?: string;
    }) {
        const onDidVisibilityChange = new Emitter<{ isVisible: boolean }>();
        const onDidLocationChange = new Emitter<any>();
        const onDidActiveChange = new Emitter<any>();

        const panel = fromPartial<DockviewPanel>({
            id: 'panel_id',
            update: jest.fn(),
            setTitle: jest.fn(),
            setRenderer: jest.fn(),
            ...options?.panel,
        });

        const groupApi = {
            location: { type: 'grid' },
            getWindow: jest.fn(),
            maximize: jest.fn(),
            isMaximized: jest.fn(),
            exitMaximized: jest.fn(),
            onDidVisibilityChange: onDidVisibilityChange.event,
            onDidLocationChange: onDidLocationChange.event,
            onDidActiveChange: onDidActiveChange.event,
            ...options?.groupApi,
        };

        const group = fromPartial<DockviewGroupPanel>({
            id: 'group_id',
            isActive: false,
            api: groupApi,
            model: {
                closePanel: jest.fn(),
                isPanelActive: jest.fn(),
            },
            ...options?.group,
        });

        // by default the panel reports it belongs to the group under test
        if ((panel as any).group === undefined) {
            (panel as any).group = group;
        }

        const accessor = fromPartial<DockviewComponent>({
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest.fn(),
            // no transaction is in flight in these fixtures, so location
            // changes report straight away
            deferLocationChange: (_key: object, fire: () => void) => fire(),
            moveGroupOrPanel: jest.fn(),
            setPanelPinned: jest.fn(),
            withOrigin: jest.fn((_origin: string, cb: () => void) => cb()),
            ...options?.accessor,
        });

        const cut = new DockviewPanelApiImpl(
            panel,
            group,
            accessor,
            'fake-component',
            options?.tabComponent
        );

        return {
            cut,
            panel,
            group,
            groupApi,
            accessor,
            emitters: {
                onDidVisibilityChange,
                onDidLocationChange,
                onDidActiveChange,
            },
        };
    }

    test('location delegates to group.api.location', () => {
        const { cut, groupApi } = createFixture({
            groupApi: { location: { type: 'floating' } },
        });
        expect(cut.location).toBe(groupApi.location);
    });

    test('title delegates to panel.title', () => {
        const { cut } = createFixture({ panel: { title: 'a_title' } });
        expect(cut.title).toBe('a_title');
    });

    test('isPinned delegates to panel.isPinned', () => {
        const { cut } = createFixture({ panel: { isPinned: true } as any });
        expect(cut.isPinned).toBe(true);
    });

    test('isGroupActive delegates to group.isActive', () => {
        const { cut } = createFixture({ group: { isActive: true } });
        expect(cut.isGroupActive).toBe(true);
    });

    test('renderer delegates to panel.renderer', () => {
        const { cut } = createFixture({
            panel: { renderer: 'onlyWhenVisible' } as any,
        });
        expect(cut.renderer).toBe('onlyWhenVisible');
    });

    test('tabComponent returns the value provided in the constructor', () => {
        const { cut } = createFixture({ tabComponent: 'my-tab' });
        expect(cut.tabComponent).toBe('my-tab');
    });

    test('tabComponent is undefined when not provided', () => {
        const { cut } = createFixture();
        expect(cut.tabComponent).toBeUndefined();
    });

    test('getWindow delegates to group.api.getWindow', () => {
        const theWindow = {} as Window;
        const getWindow = jest.fn(() => theWindow);
        const { cut } = createFixture({ groupApi: { getWindow } });
        expect(cut.getWindow()).toBe(theWindow);
        expect(getWindow).toHaveBeenCalledTimes(1);
    });

    test('setActive tags the activation with the "api" origin', () => {
        const { cut, accessor } = createFixture();

        let activeEvents = 0;
        const disposable = cut.onActiveChange(() => {
            activeEvents++;
        });

        cut.setActive();

        expect(accessor.withOrigin).toHaveBeenCalledTimes(1);
        expect((accessor.withOrigin as jest.Mock).mock.calls[0][0]).toBe('api');
        // the wrapped super.setActive() should still have run
        expect(activeEvents).toBe(1);

        disposable.dispose();
    });

    test('setPinned delegates to accessor.setPanelPinned', () => {
        const { cut, accessor, panel } = createFixture();
        cut.setPinned(true);
        expect(accessor.setPanelPinned).toHaveBeenCalledTimes(1);
        expect(accessor.setPanelPinned).toHaveBeenCalledWith(panel, true);
    });

    test('setRenderer delegates to panel.setRenderer', () => {
        const { cut, panel } = createFixture();
        cut.setRenderer('always');
        expect(panel.setRenderer).toHaveBeenCalledTimes(1);
        expect(panel.setRenderer).toHaveBeenCalledWith('always');
    });

    test('close delegates to group.model.closePanel', () => {
        const { cut, group, panel } = createFixture();
        cut.close();
        expect(group.model.closePanel).toHaveBeenCalledTimes(1);
        expect(group.model.closePanel).toHaveBeenCalledWith(panel);
    });

    test('maximize delegates to group.api.maximize', () => {
        const { cut, groupApi } = createFixture();
        cut.maximize();
        expect(groupApi.maximize).toHaveBeenCalledTimes(1);
    });

    test('isMaximized returns group.api.isMaximized result', () => {
        const isMaximized = jest.fn(() => true);
        const { cut } = createFixture({ groupApi: { isMaximized } });
        expect(cut.isMaximized()).toBe(true);
        expect(isMaximized).toHaveBeenCalledTimes(1);
    });

    test('exitMaximized delegates to group.api.exitMaximized', () => {
        const { cut, groupApi } = createFixture();
        cut.exitMaximized();
        expect(groupApi.exitMaximized).toHaveBeenCalledTimes(1);
    });

    test('moveTo with no target group stays in current group at center', () => {
        const { cut, accessor, group, panel } = createFixture();
        cut.moveTo({});
        expect(accessor.moveGroupOrPanel).toHaveBeenCalledTimes(1);
        expect(accessor.moveGroupOrPanel).toHaveBeenCalledWith({
            from: { groupId: group.id, panelId: panel.id },
            to: {
                group,
                position: 'center',
                index: undefined,
            },
            skipSetActive: undefined,
        });
    });

    test('moveTo with a target group forwards position, index and skipSetActive', () => {
        const { cut, accessor, group, panel } = createFixture();
        const targetGroup = fromPartial<DockviewGroupPanel>({
            id: 'target_group',
        });

        cut.moveTo({
            group: targetGroup,
            position: 'right',
            index: 3,
            skipSetActive: true,
        });

        expect(accessor.moveGroupOrPanel).toHaveBeenCalledWith({
            from: { groupId: group.id, panelId: panel.id },
            to: {
                group: targetGroup,
                position: 'right',
                index: 3,
            },
            skipSetActive: true,
        });
    });

    test('moveTo with a target group defaults position to center', () => {
        const { cut, accessor } = createFixture();
        const targetGroup = fromPartial<DockviewGroupPanel>({
            id: 'target_group',
        });

        cut.moveTo({ group: targetGroup });

        const call = (accessor.moveGroupOrPanel as jest.Mock).mock.calls[0][0];
        expect(call.to.group).toBe(targetGroup);
        expect(call.to.position).toBe('center');
    });

    test('group visibility change fires onDidVisibilityChange when panel becomes hidden', () => {
        const { cut, emitters } = createFixture();

        const events: boolean[] = [];
        const disposable = cut.onDidVisibilityChange((e) => {
            events.push(e.isVisible);
        });

        // panel starts visible; the group becoming hidden should propagate
        emitters.onDidVisibilityChange.fire({ isVisible: false });

        expect(events).toEqual([false]);

        disposable.dispose();
    });

    test('group visibility change fires when becoming visible and panel is the active panel', () => {
        const isPanelActive = jest.fn(() => true);
        const { cut, emitters } = createFixture({
            group: { model: { isPanelActive } as any },
        });

        // first drive it hidden so the panel is not visible
        emitters.onDidVisibilityChange.fire({ isVisible: false });

        const events: boolean[] = [];
        const disposable = cut.onDidVisibilityChange((e) => {
            events.push(e.isVisible);
        });

        emitters.onDidVisibilityChange.fire({ isVisible: true });

        expect(events).toEqual([true]);
        expect(isPanelActive).toHaveBeenCalled();

        disposable.dispose();
    });

    test('group visibility change does not fire when becoming visible but panel is not active', () => {
        const isPanelActive = jest.fn(() => false);
        const { cut, emitters } = createFixture({
            group: { model: { isPanelActive } as any },
        });

        emitters.onDidVisibilityChange.fire({ isVisible: false });

        let events = 0;
        const disposable = cut.onDidVisibilityChange(() => {
            events++;
        });

        emitters.onDidVisibilityChange.fire({ isVisible: true });

        expect(events).toBe(0);

        disposable.dispose();
    });

    test('group location change fires onDidLocationChange when group is the panel group', () => {
        const { cut, groupApi, emitters } = createFixture();

        const events: any[] = [];
        const disposable = cut.onDidLocationChange((e) => {
            events.push(e);
        });

        // the panel reports where its group is when the event is delivered
        // rather than forwarding the payload it was signalled with: the signal
        // may be coalesced to the end of a layout mutation, by which point only
        // the settled location is meaningful
        groupApi.location = { type: 'floating' };
        emitters.onDidLocationChange.fire({ location: groupApi.location });

        expect(events).toEqual([{ location: { type: 'floating' } }]);

        disposable.dispose();
    });

    test('group location change is ignored when group is not the panel group', () => {
        const { cut, emitters, panel } = createFixture();
        // make the panel report a different group than the one under test
        (panel as any).group = fromPartial<DockviewGroupPanel>({
            id: 'other_group',
        });

        let events = 0;
        const disposable = cut.onDidLocationChange(() => {
            events++;
        });

        emitters.onDidLocationChange.fire({ location: { type: 'grid' } });

        expect(events).toBe(0);

        disposable.dispose();
    });

    test('group active change fires onDidActiveGroupChange when the active state changes', () => {
        const { cut, group, emitters } = createFixture();

        const events: boolean[] = [];
        const disposable = cut.onDidActiveGroupChange((e) => {
            events.push(e.isActive);
        });

        (group as any).isActive = true;
        emitters.onDidActiveChange.fire({});

        expect(events).toEqual([true]);

        disposable.dispose();
    });

    test('group active change does not fire when the active state is unchanged', () => {
        const { cut, emitters } = createFixture({
            group: { isActive: false },
        });

        let events = 0;
        const disposable = cut.onDidActiveGroupChange(() => {
            events++;
        });

        // isActive stays false, matching the initial tracked state
        emitters.onDidActiveChange.fire({});

        expect(events).toBe(0);

        disposable.dispose();
    });

    test('group active change is ignored when group is not the panel group', () => {
        const { cut, group, emitters, panel } = createFixture();
        (panel as any).group = fromPartial<DockviewGroupPanel>({
            id: 'other_group',
        });

        let events = 0;
        const disposable = cut.onDidActiveGroupChange(() => {
            events++;
        });

        (group as any).isActive = true;
        emitters.onDidActiveChange.fire({});

        expect(events).toBe(0);

        disposable.dispose();
    });

    test('setting group to the same value is a no-op', () => {
        const { cut, group } = createFixture();

        let events = 0;
        const disposable = cut.onDidGroupChange(() => {
            events++;
        });

        cut.group = group;

        expect(events).toBe(0);
        expect(cut.group).toBe(group);

        disposable.dispose();
    });

    test('onDidTitleChange fires when the internal title emitter fires', () => {
        const { cut } = createFixture();

        const events: string[] = [];
        const disposable = cut.onDidTitleChange((e) => {
            events.push(e.title);
        });

        cut._onDidTitleChange.fire({ title: 'next' });

        expect(events).toEqual(['next']);

        disposable.dispose();
    });

    test('onDidChangePinned fires when the internal pinned emitter fires', () => {
        const { cut } = createFixture();

        const events: boolean[] = [];
        const disposable = cut.onDidChangePinned((e) => {
            events.push(e.isPinned);
        });

        cut._onDidChangePinned.fire({ isPinned: true });

        expect(events).toEqual([true]);

        disposable.dispose();
    });

    test('onDidRendererChange fires when the internal renderer emitter fires', () => {
        const { cut } = createFixture();

        const events: string[] = [];
        const disposable = cut.onDidRendererChange((e) => {
            events.push(e.renderer);
        });

        cut._onDidRendererChange.fire({ renderer: 'always' });

        expect(events).toEqual(['always']);

        disposable.dispose();
    });
});
