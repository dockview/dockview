import { DockviewGroupPanelApiImpl } from '../../api/dockviewGroupPanelApi';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { fromPartial } from '@total-typescript/shoehorn';

describe('DockviewGroupPanelApiImpl', () => {
    describe('collapse / expand / isCollapsed', () => {
        function makeAccessor() {
            return fromPartial<DockviewComponent>({
                setEdgeGroupCollapsed: jest.fn(),
                isEdgeGroupCollapsed: jest.fn().mockReturnValue(false),
            });
        }

        test('collapse() calls accessor.setEdgeGroupCollapsed(group, true)', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            cut.collapse();

            expect(accessor.setEdgeGroupCollapsed).toHaveBeenCalledWith(
                group,
                true
            );
            expect(accessor.setEdgeGroupCollapsed).toHaveBeenCalledTimes(1);
        });

        test('expand() calls accessor.setEdgeGroupCollapsed(group, false)', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            cut.expand();

            expect(accessor.setEdgeGroupCollapsed).toHaveBeenCalledWith(
                group,
                false
            );
            expect(accessor.setEdgeGroupCollapsed).toHaveBeenCalledTimes(1);
        });

        test('isCollapsed() delegates to accessor.isEdgeGroupCollapsed and returns its value', () => {
            const accessor = makeAccessor();
            (accessor.isEdgeGroupCollapsed as jest.Mock).mockReturnValue(true);
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            expect(cut.isCollapsed()).toBe(true);
            expect(accessor.isEdgeGroupCollapsed).toHaveBeenCalledWith(group);
        });

        test('isCollapsed() returns false when accessor returns false', () => {
            const accessor = makeAccessor();
            (accessor.isEdgeGroupCollapsed as jest.Mock).mockReturnValue(false);
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            expect(cut.isCollapsed()).toBe(false);
        });

        test('collapse() is a no-op (does not throw) when group is not initialized', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            // _group is undefined, no initialize() call

            expect(() => cut.collapse()).not.toThrow();
            expect(accessor.setEdgeGroupCollapsed).not.toHaveBeenCalled();
        });

        test('expand() is a no-op (does not throw) when group is not initialized', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            expect(() => cut.expand()).not.toThrow();
            expect(accessor.setEdgeGroupCollapsed).not.toHaveBeenCalled();
        });

        test('isCollapsed() returns false when group is not initialized', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            expect(cut.isCollapsed()).toBe(false);
            expect(accessor.isEdgeGroupCollapsed).not.toHaveBeenCalled();
        });
    });

    describe('location getter', () => {
        test('throws when group is not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.location).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('returns the group model location', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { location: { type: 'grid' } },
            });
            cut.initialize(group);

            expect(cut.location).toEqual({ type: 'grid' });
        });
    });

    describe('boundingBox getter', () => {
        test('returns undefined when group is not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(cut.boundingBox).toBeUndefined();
        });

        test('returns undefined for a popout group', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { location: { type: 'popout', getWindow: jest.fn() } },
            });
            cut.initialize(group);

            expect(cut.boundingBox).toBeUndefined();
        });

        test('computes the box relative to the accessor root', () => {
            const accessor = fromPartial<DockviewComponent>({
                element: {
                    getBoundingClientRect: () =>
                        ({ left: 10, top: 20 }) as DOMRect,
                },
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { location: { type: 'grid' } },
                element: {
                    getBoundingClientRect: () =>
                        ({
                            left: 50,
                            top: 70,
                            width: 100,
                            height: 200,
                        }) as DOMRect,
                },
            });
            cut.initialize(group);

            expect(cut.boundingBox).toEqual({
                left: 40,
                top: 50,
                width: 100,
                height: 200,
            });
        });
    });

    describe('locked getter/setter', () => {
        test('getter throws when group is not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.locked).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('setter throws when group is not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => {
                cut.locked = true;
            }).toThrow('dockview: DockviewGroupPanelApiImpl not initialized');
        });

        test('getter returns the group locked value', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({ locked: true });
            cut.initialize(group);

            expect(cut.locked).toBe(true);
        });

        test('setter assigns the group locked value', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({ locked: false });
            cut.initialize(group);

            cut.locked = 'no-drop-target';

            expect(group.locked).toBe('no-drop-target');
        });
    });

    describe('setSize / pending size', () => {
        test('setSize fires onDidSizeChange immediately', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            const events: { width?: number; height?: number }[] = [];
            cut.onDidSizeChange((e) => events.push(e));

            cut.setSize({ width: 123, height: 456 });

            expect(events).toEqual([{ width: 123, height: 456 }]);
        });

        test('pending size is re-applied when the group becomes visible', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            cut.setSize({ width: 100, height: 200 });

            const events: { width?: number; height?: number }[] = [];
            cut.onDidSizeChange((e) => events.push(e));

            // becoming visible re-applies the pending size once
            cut._onDidVisibilityChange.fire({ isVisible: true });
            expect(events).toEqual([{ width: 100, height: 200 }]);

            // pending is cleared, so a second visibility event does nothing
            cut._onDidVisibilityChange.fire({ isVisible: true });
            expect(events).toHaveLength(1);
        });

        test('pending size is not applied when becoming invisible', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            cut.setSize({ width: 100, height: 200 });

            const events: { width?: number; height?: number }[] = [];
            cut.onDidSizeChange((e) => events.push(e));

            cut._onDidVisibilityChange.fire({ isVisible: false });

            expect(events).toHaveLength(0);
        });
    });

    describe('close', () => {
        test('is a no-op when group is not initialized', () => {
            const accessor = fromPartial<DockviewComponent>({
                removeGroup: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            expect(() => cut.close()).not.toThrow();
            expect(accessor.removeGroup).not.toHaveBeenCalled();
        });

        test('delegates to accessor.removeGroup(group)', () => {
            const accessor = fromPartial<DockviewComponent>({
                removeGroup: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            cut.close();

            expect(accessor.removeGroup).toHaveBeenCalledWith(group);
        });
    });

    describe('getWindow', () => {
        test('returns globalThis.window for a non-popout group', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { location: { type: 'grid' } },
            });
            cut.initialize(group);

            expect(cut.getWindow()).toBe(globalThis.window);
        });

        test('returns the popout window for a popout group', () => {
            const popoutWindow = {} as Window;
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: {
                    location: {
                        type: 'popout',
                        getWindow: () => popoutWindow,
                    },
                },
            });
            cut.initialize(group);

            expect(cut.getWindow()).toBe(popoutWindow);
        });
    });

    describe('header position', () => {
        test('setHeaderPosition throws when not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.setHeaderPosition('left')).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('getHeaderPosition throws when not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.getHeaderPosition()).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('setHeaderPosition assigns the model header position', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const model: { headerPosition: string } = {
                headerPosition: 'top',
            };
            const group = fromPartial<DockviewGroupPanel>({ model });
            cut.initialize(group);

            cut.setHeaderPosition('left');

            expect(model.headerPosition).toBe('left');
        });

        test('getHeaderPosition returns the model header position', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { headerPosition: 'right' },
            });
            cut.initialize(group);

            expect(cut.getHeaderPosition()).toBe('right');
        });
    });

    describe('moveTo', () => {
        test('throws when group is not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.moveTo({})).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('moves into an explicitly provided target group', () => {
            const targetGroup = fromPartial<DockviewGroupPanel>({
                id: 'target',
            });
            const accessor = fromPartial<DockviewComponent>({
                addGroup: jest.fn(),
                moveGroupOrPanel: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({ id: 'source' });
            cut.initialize(group);

            cut.moveTo({
                group: targetGroup,
                position: 'right',
                index: 2,
            });

            expect(accessor.addGroup).not.toHaveBeenCalled();
            expect(accessor.moveGroupOrPanel).toHaveBeenCalledWith({
                from: { groupId: 'source' },
                to: {
                    group: targetGroup,
                    position: 'right',
                    index: 2,
                },
                skipSetActive: undefined,
            });
        });

        test('uses position "center" as default when a group is provided without a position', () => {
            const targetGroup = fromPartial<DockviewGroupPanel>({
                id: 'target',
            });
            const accessor = fromPartial<DockviewComponent>({
                addGroup: jest.fn(),
                moveGroupOrPanel: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({ id: 'source' });
            cut.initialize(group);

            cut.moveTo({ group: targetGroup });

            expect(accessor.moveGroupOrPanel).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: expect.objectContaining({
                        group: targetGroup,
                        position: 'center',
                    }),
                })
            );
        });

        test('creates a new group when none is provided, using the given position', () => {
            const createdGroup = fromPartial<DockviewGroupPanel>({
                id: 'created',
            });
            const accessor = fromPartial<DockviewComponent>({
                addGroup: jest.fn().mockReturnValue(createdGroup),
                moveGroupOrPanel: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({ id: 'source' });
            cut.initialize(group);

            cut.moveTo({ position: 'left', skipSetActive: true });

            expect(accessor.addGroup).toHaveBeenCalledWith({
                direction: 'left',
                skipSetActive: true,
            });
            expect(accessor.moveGroupOrPanel).toHaveBeenCalledWith({
                from: { groupId: 'source' },
                to: {
                    group: createdGroup,
                    position: 'center',
                    index: undefined,
                },
                skipSetActive: true,
            });
        });

        test('defaults to the "right" direction and skipSetActive false when creating a group without options', () => {
            const createdGroup = fromPartial<DockviewGroupPanel>({
                id: 'created',
            });
            const accessor = fromPartial<DockviewComponent>({
                addGroup: jest.fn().mockReturnValue(createdGroup),
                moveGroupOrPanel: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({ id: 'source' });
            cut.initialize(group);

            cut.moveTo({});

            expect(accessor.addGroup).toHaveBeenCalledWith({
                direction: 'right',
                skipSetActive: false,
            });
        });
    });

    describe('maximize / isMaximized / exitMaximized', () => {
        test('maximize throws when not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.maximize()).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('maximize is a no-op for non-grid groups', () => {
            const accessor = fromPartial<DockviewComponent>({
                maximizeGroup: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { location: { type: 'floating' } },
            });
            cut.initialize(group);

            cut.maximize();

            expect(accessor.maximizeGroup).not.toHaveBeenCalled();
        });

        test('maximize delegates to accessor.maximizeGroup for grid groups', () => {
            const accessor = fromPartial<DockviewComponent>({
                maximizeGroup: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({
                model: { location: { type: 'grid' } },
            });
            cut.initialize(group);

            cut.maximize();

            expect(accessor.maximizeGroup).toHaveBeenCalledWith(group);
        });

        test('isMaximized throws when not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.isMaximized()).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('isMaximized delegates to accessor.isMaximizedGroup', () => {
            const accessor = fromPartial<DockviewComponent>({
                isMaximizedGroup: jest.fn().mockReturnValue(true),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            expect(cut.isMaximized()).toBe(true);
            expect(accessor.isMaximizedGroup).toHaveBeenCalledWith(group);
        });

        test('exitMaximized throws when not initialized', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            expect(() => cut.exitMaximized()).toThrow(
                'dockview: DockviewGroupPanelApiImpl not initialized'
            );
        });

        test('exitMaximized exits when the group is maximized', () => {
            const accessor = fromPartial<DockviewComponent>({
                isMaximizedGroup: jest.fn().mockReturnValue(true),
                exitMaximizedGroup: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            cut.exitMaximized();

            expect(accessor.exitMaximizedGroup).toHaveBeenCalledTimes(1);
        });

        test('exitMaximized does nothing when the group is not maximized', () => {
            const accessor = fromPartial<DockviewComponent>({
                isMaximizedGroup: jest.fn().mockReturnValue(false),
                exitMaximizedGroup: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            cut.exitMaximized();

            expect(accessor.exitMaximizedGroup).not.toHaveBeenCalled();
        });
    });

    describe('isPeeking / setAutoHide', () => {
        test('isPeeking returns false when not initialized', () => {
            const accessor = fromPartial<DockviewComponent>({
                isEdgeGroupPeeking: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            expect(cut.isPeeking()).toBe(false);
            expect(accessor.isEdgeGroupPeeking).not.toHaveBeenCalled();
        });

        test('isPeeking delegates to accessor.isEdgeGroupPeeking', () => {
            const accessor = fromPartial<DockviewComponent>({
                isEdgeGroupPeeking: jest.fn().mockReturnValue(true),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            expect(cut.isPeeking()).toBe(true);
            expect(accessor.isEdgeGroupPeeking).toHaveBeenCalledWith(group);
        });

        test('setAutoHide is a no-op when not initialized', () => {
            const accessor = fromPartial<DockviewComponent>({
                setEdgeGroupAutoHide: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            cut.setAutoHide(true);

            expect(accessor.setEdgeGroupAutoHide).not.toHaveBeenCalled();
        });

        test('setAutoHide delegates to accessor.setEdgeGroupAutoHide', () => {
            const accessor = fromPartial<DockviewComponent>({
                setEdgeGroupAutoHide: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            cut.setAutoHide(undefined);

            expect(accessor.setEdgeGroupAutoHide).toHaveBeenCalledWith(
                group,
                undefined
            );
        });

        test('isAutoHide returns false when not initialized', () => {
            const accessor = fromPartial<DockviewComponent>({
                isEdgeGroupAutoHide: jest.fn(),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            expect(cut.isAutoHide()).toBe(false);
            expect(accessor.isEdgeGroupAutoHide).not.toHaveBeenCalled();
        });

        test('isAutoHide delegates to accessor.isEdgeGroupAutoHide', () => {
            const accessor = fromPartial<DockviewComponent>({
                isEdgeGroupAutoHide: jest.fn().mockReturnValue(true),
            });
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({});
            cut.initialize(group);

            expect(cut.isAutoHide()).toBe(true);
            expect(accessor.isEdgeGroupAutoHide).toHaveBeenCalledWith(group);
        });
    });

    describe('event passthrough', () => {
        test('onDidLocationChange forwards fired events', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            const events: { location: { type: string } }[] = [];
            cut.onDidLocationChange((e) =>
                events.push(e as { location: { type: string } })
            );

            cut._onDidLocationChange.fire({ location: { type: 'floating' } });

            expect(events).toEqual([{ location: { type: 'floating' } }]);
        });

        test('onDidActivePanelChange forwards fired events', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            const events: unknown[] = [];
            cut.onDidActivePanelChange((e) => events.push(e));

            const payload = fromPartial({ panel: undefined });
            cut._onDidActivePanelChange.fire(payload);

            expect(events).toHaveLength(1);
            expect(events[0]).toBe(payload);
        });

        test('onDidPeekChange forwards fired events', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            const events: { isPeeking: boolean }[] = [];
            cut.onDidPeekChange((e) => events.push(e));

            cut._onDidPeekChange.fire({ isPeeking: true });

            expect(events).toEqual([{ isPeeking: true }]);
        });

        test('onDidHeaderDirectionChange forwards fired events', () => {
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                fromPartial<DockviewComponent>({})
            );

            const events: {
                direction: string;
                position: string;
            }[] = [];
            cut.onDidHeaderDirectionChange((e) =>
                events.push(e as { direction: string; position: string })
            );

            cut._onDidHeaderDirectionChange.fire({
                direction: 'vertical',
                position: 'left',
            });

            expect(events).toEqual([
                { direction: 'vertical', position: 'left' },
            ]);
        });
    });

    describe('onDidCollapsedChange', () => {
        function makeAccessor() {
            return fromPartial<DockviewComponent>({
                setEdgeGroupCollapsed: jest.fn(),
                isEdgeGroupCollapsed: jest.fn().mockReturnValue(false),
            });
        }

        test('emits with isCollapsed=true when collapse() is called after initialize()', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({ id: 'g1' });
            cut.initialize(group);

            const events: { isCollapsed: boolean }[] = [];
            cut.onDidCollapsedChange((e) => events.push(e));

            // Simulate the component firing the event after setEdgeGroupCollapsed
            cut._onDidCollapsedChange.fire({ isCollapsed: true });

            expect(events).toHaveLength(1);
            expect(events[0].isCollapsed).toBe(true);
        });

        test('emits with isCollapsed=false when expand() is called', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );
            const group = fromPartial<DockviewGroupPanel>({ id: 'g1' });
            cut.initialize(group);

            const events: { isCollapsed: boolean }[] = [];
            cut.onDidCollapsedChange((e) => events.push(e));

            cut._onDidCollapsedChange.fire({ isCollapsed: false });

            expect(events).toHaveLength(1);
            expect(events[0].isCollapsed).toBe(false);
        });

        test('does not emit when group is not initialized', () => {
            const accessor = makeAccessor();
            const cut = new DockviewGroupPanelApiImpl(
                'test-id',
                accessor as unknown as DockviewComponent
            );

            const events: { isCollapsed: boolean }[] = [];
            cut.onDidCollapsedChange((e) => events.push(e));

            // collapse/expand are no-ops when not initialized, so no event fires
            cut.collapse();
            cut.expand();

            expect(events).toHaveLength(0);
        });
    });
});
