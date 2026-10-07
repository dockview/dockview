import {
    EdgeGroupOptions,
    IEdgeGroupHost,
    SerializedEdgeStack,
    ShellManager,
} from '../../dockview/dockviewShell';
import { EdgeStackView } from '../../dockview/edgeStack';

function makeGroup(): IEdgeGroupHost & { layout: jest.Mock } {
    return {
        element: document.createElement('div'),
        layout: jest.fn(),
    };
}

describe('ShellManager', () => {
    let container: HTMLElement;
    let dockviewElement: HTMLElement;
    let layoutGrid: jest.Mock;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockviewElement = document.createElement('div');
        layoutGrid = jest.fn();
    });

    afterEach(() => {
        container.parentElement?.removeChild(container);
    });

    /** The group host registered at each position by the last `makeShell`. */
    let groups: Partial<
        Record<'top' | 'bottom' | 'left' | 'right', IEdgeGroupHost>
    >;

    function makeShell(
        config: Partial<
            Record<'top' | 'bottom' | 'left' | 'right', EdgeGroupViewOptions>
        >,
        gap = 0,
        defaultCollapsedSize = 35
    ): ShellManager {
        const shell = new ShellManager(
            container,
            dockviewElement,
            layoutGrid,
            gap,
            defaultCollapsedSize
        );
        groups = {};
        for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
            if (config[pos]) {
                const group = makeGroup();
                groups[pos] = group;
                shell.addEdgeView(pos, config[pos]!, group);
            }
        }
        return shell;
    }

    /** The stack view the shell sizes across the edge at `position`. */
    function stackOf(
        shell: ShellManager,
        position: 'top' | 'bottom' | 'left' | 'right'
    ): EdgeStackView {
        return (shell as any)._stacks.get(position);
    }

    describe('hasEdgeGroup', () => {
        test('returns true for configured positions and false for others', () => {
            const shell = makeShell({ left: { id: 'left' } });
            expect(shell.hasEdgeGroup('left')).toBe(true);
            expect(shell.hasEdgeGroup('right')).toBe(false);
            expect(shell.hasEdgeGroup('top')).toBe(false);
            expect(shell.hasEdgeGroup('bottom')).toBe(false);
            shell.dispose();
        });

        test('returns true for all four positions when all configured', () => {
            const shell = makeShell({
                left: { id: 'left' },
                right: { id: 'right' },
                top: { id: 'top' },
                bottom: { id: 'bottom' },
            });
            expect(shell.hasEdgeGroup('left')).toBe(true);
            expect(shell.hasEdgeGroup('right')).toBe(true);
            expect(shell.hasEdgeGroup('top')).toBe(true);
            expect(shell.hasEdgeGroup('bottom')).toBe(true);
            shell.dispose();
        });

        describe('layoutFromElement', () => {
            /** jsdom computes no layout, so the shell's measured size is supplied. */
            const setShellSize = (
                shell: ShellManager,
                width: number,
                height: number
            ) => {
                Object.defineProperty(shell.element, 'clientWidth', {
                    configurable: true,
                    get: () => width,
                });
                Object.defineProperty(shell.element, 'clientHeight', {
                    configurable: true,
                    get: () => height,
                });
            };

            const setVisible = (shell: ShellManager, visible: boolean) => {
                Object.defineProperty(shell.element, 'offsetParent', {
                    configurable: true,
                    get: () => (visible ? document.body : null),
                });
            };

            test('lays the grid out from the shell size', () => {
                const shell = new ShellManager(
                    container,
                    dockviewElement,
                    layoutGrid
                );
                setVisible(shell, true);
                setShellSize(shell, 800, 600);
                layoutGrid.mockClear();

                shell.layoutFromElement();

                expect(layoutGrid).toHaveBeenCalledWith(800, 600);
                shell.dispose();
            });

            test('skips when the shell is hidden', () => {
                const shell = new ShellManager(
                    container,
                    dockviewElement,
                    layoutGrid
                );
                setVisible(shell, false);
                setShellSize(shell, 800, 600);
                layoutGrid.mockClear();

                shell.layoutFromElement();

                expect(layoutGrid).not.toHaveBeenCalled();
                shell.dispose();
            });

            test('skips when the shell is not in the document', () => {
                const detached = document.createElement('div');
                const shell = new ShellManager(
                    detached,
                    dockviewElement,
                    layoutGrid
                );
                setVisible(shell, true);
                setShellSize(shell, 800, 600);
                layoutGrid.mockClear();

                shell.layoutFromElement();

                expect(layoutGrid).not.toHaveBeenCalled();
                shell.dispose();
            });

            test.each([
                ['zero width', 0, 600],
                ['zero height', 800, 0],
            ])('skips a %s shell', (_label, width, height) => {
                const shell = new ShellManager(
                    container,
                    dockviewElement,
                    layoutGrid
                );
                setVisible(shell, true);
                setShellSize(shell, width, height);
                layoutGrid.mockClear();

                shell.layoutFromElement();

                expect(layoutGrid).not.toHaveBeenCalled();
                shell.dispose();
            });
        });

        test('a second group at a position joins that edge in order', () => {
            const shell = new ShellManager(
                container,
                dockviewElement,
                layoutGrid
            );
            const first = shell.addEdgeView(
                'left',
                { id: 'left' },
                makeGroup()
            );
            const second = shell.addEdgeView(
                'left',
                { id: 'left-2' },
                makeGroup()
            );
            expect(stackOf(shell, 'left').members).toEqual([first, second]);
            expect(shell.hasEdgeGroup('left')).toBe(true);
            shell.dispose();
        });
    });

    describe('setEdgeGroupVisible / isEdgeGroupVisible', () => {
        test('left panel: visible by default, can be hidden and shown', () => {
            const shell = makeShell({ left: { id: 'left' } });
            expect(shell.isEdgeGroupVisible('left')).toBe(true);
            shell.setEdgeGroupVisible('left', false);
            expect(shell.isEdgeGroupVisible('left')).toBe(false);
            shell.setEdgeGroupVisible('left', true);
            expect(shell.isEdgeGroupVisible('left')).toBe(true);
            shell.dispose();
        });

        test('right panel: visible by default, can be hidden', () => {
            const shell = makeShell({ right: { id: 'right' } });
            expect(shell.isEdgeGroupVisible('right')).toBe(true);
            shell.setEdgeGroupVisible('right', false);
            expect(shell.isEdgeGroupVisible('right')).toBe(false);
            shell.dispose();
        });

        test('top panel: visible by default, can be hidden', () => {
            const shell = makeShell({ top: { id: 'top' } });
            expect(shell.isEdgeGroupVisible('top')).toBe(true);
            shell.setEdgeGroupVisible('top', false);
            expect(shell.isEdgeGroupVisible('top')).toBe(false);
            shell.dispose();
        });

        test('bottom panel: visible by default, can be hidden', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } });
            expect(shell.isEdgeGroupVisible('bottom')).toBe(true);
            shell.setEdgeGroupVisible('bottom', false);
            expect(shell.isEdgeGroupVisible('bottom')).toBe(false);
            shell.dispose();
        });

        test('unconfigured position always returns false', () => {
            const shell = makeShell({});
            expect(shell.isEdgeGroupVisible('left')).toBe(false);
            expect(shell.isEdgeGroupVisible('right')).toBe(false);
            expect(shell.isEdgeGroupVisible('top')).toBe(false);
            expect(shell.isEdgeGroupVisible('bottom')).toBe(false);
            shell.dispose();
        });
    });

    describe('setEdgeGroupCollapsed / isEdgeGroupCollapsed', () => {
        test('collapse and expand left panel', () => {
            const shell = makeShell({ left: { id: 'left' } });
            expect(shell.isEdgeCollapsed('left')).toBe(false);
            shell.setEdgeGroupCollapsed(groups.left!, true);
            expect(shell.isEdgeCollapsed('left')).toBe(true);
            shell.setEdgeGroupCollapsed(groups.left!, false);
            expect(shell.isEdgeCollapsed('left')).toBe(false);
            shell.dispose();
        });

        test('collapse right panel', () => {
            const shell = makeShell({ right: { id: 'right' } });
            shell.setEdgeGroupCollapsed(groups.right!, true);
            expect(shell.isEdgeCollapsed('right')).toBe(true);
            shell.dispose();
        });

        test('collapse top panel', () => {
            const shell = makeShell({ top: { id: 'top' } });
            shell.setEdgeGroupCollapsed(groups.top!, true);
            expect(shell.isEdgeCollapsed('top')).toBe(true);
            shell.dispose();
        });

        test('collapse bottom panel', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } });
            shell.setEdgeGroupCollapsed(groups.bottom!, true);
            expect(shell.isEdgeCollapsed('bottom')).toBe(true);
            shell.dispose();
        });

        test('collapse of an unregistered group is a no-op', () => {
            const shell = makeShell({});
            expect(() =>
                shell.setEdgeGroupCollapsed(makeGroup(), true)
            ).not.toThrow();
            expect(shell.isEdgeCollapsed('left')).toBe(false);
            shell.dispose();
        });
    });

    describe('resizeEdgeGroup', () => {
        function sizeOf(
            shell: ShellManager,
            position: 'top' | 'bottom' | 'left' | 'right'
        ): number {
            const s = shell as any;
            if (position === 'left' || position === 'right') {
                return s._outerSplitview.getViewSize(
                    position === 'left' ? s._leftIndex : s._rightIndex
                );
            }
            return s._middleColumn.getViewSize(position);
        }

        describe.each([
            'left',
            'right',
            'top',
            'bottom',
        ] as const)('%s edge group', (position) => {
            const cfg = (extra: Partial<EdgeGroupViewOptions> = {}) =>
                ({
                    [position]: {
                        id: position,
                        initialSize: 260,
                        ...extra,
                    },
                }) as Parameters<typeof makeShell>[0];

            test('resizes along its own axis', () => {
                const shell = makeShell(cfg());
                shell.layout(1000, 800);

                shell.resizeEdgeGroup(position, 420);

                expect(sizeOf(shell, position)).toBe(420);
                expect(shell.getEdgeGroupExpandedSize(position)).toBe(420);
                shell.dispose();
            });

            test('takes its initialSize on the first layout', () => {
                const shell = makeShell(cfg());
                shell.layout(1000, 800);

                expect(sizeOf(shell, position)).toBe(260);
                shell.dispose();
            });

            test('a resize requested before layout lands on it', () => {
                const shell = makeShell(cfg());
                shell.resizeEdgeGroup(position, 420);

                shell.layout(1000, 800);

                expect(sizeOf(shell, position)).toBe(420);
                shell.dispose();
            });

            test('a collapsed group keeps its strip and expands to the new size', () => {
                const shell = makeShell(cfg());
                shell.layout(1000, 800);
                shell.setEdgeGroupCollapsed(groups[position]!, true);
                const collapsed = sizeOf(shell, position);

                shell.resizeEdgeGroup(position, 420);
                expect(sizeOf(shell, position)).toBe(collapsed);

                shell.setEdgeGroupCollapsed(groups[position]!, false);
                expect(sizeOf(shell, position)).toBe(420);
                shell.dispose();
            });

            test('a resize requested while hidden lands when shown', () => {
                const shell = makeShell(cfg());
                shell.layout(1000, 800);
                shell.setEdgeGroupVisible(position, false);

                shell.resizeEdgeGroup(position, 420);
                expect(sizeOf(shell, position)).toBe(0);

                shell.setEdgeGroupVisible(position, true);
                expect(sizeOf(shell, position)).toBe(420);
                shell.dispose();
            });

            test('toJSON persists a held size, not the size it is stranded at', () => {
                const preLayout = makeShell(cfg());
                preLayout.resizeEdgeGroup(position, 420);
                expect(preLayout.toJSON()[position]!.size).toBe(420);
                preLayout.dispose();

                const hidden = makeShell(cfg());
                hidden.layout(1000, 800);
                hidden.setEdgeGroupVisible(position, false);
                hidden.resizeEdgeGroup(position, 420);
                expect(hidden.toJSON()[position]!.size).toBe(420);
                hidden.dispose();
            });

            test('fromJSON restores size, collapsed and visible state', () => {
                const shell = makeShell(cfg());
                shell.layout(1000, 800);

                shell.fromJSON({
                    [position]: { size: 420, visible: true },
                });
                expect(sizeOf(shell, position)).toBe(420);

                shell.fromJSON({
                    [position]: {
                        size: 420,
                        visible: true,
                        collapsed: true,
                    },
                });
                expect(shell.isEdgeCollapsed(position)).toBe(true);

                shell.fromJSON({
                    [position]: { size: 300, visible: false },
                });
                expect(shell.isEdgeGroupVisible(position)).toBe(false);

                // ...and back: re-showing applies the restored size
                shell.fromJSON({
                    [position]: { size: 300, visible: true },
                });
                expect(shell.isEdgeGroupVisible(position)).toBe(true);
                expect(shell.isEdgeCollapsed(position)).toBe(false);
                expect(sizeOf(shell, position)).toBe(300);
                shell.dispose();
            });
        });

        test('clamps to the configured maximumSize', () => {
            const shell = makeShell({
                left: { id: 'left', initialSize: 260, maximumSize: 350 },
            });
            shell.layout(1000, 800);

            shell.resizeEdgeGroup('left', 900);

            expect(sizeOf(shell, 'left')).toBe(350);
            shell.dispose();
        });

        test('a fromJSON before layout applies the restored size on the first layout', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 260 } });

            shell.fromJSON({ left: { size: 420, visible: true } });
            shell.layout(1000, 800);

            expect(sizeOf(shell, 'left')).toBe(420);
            shell.dispose();
        });

        test('a sash resize after a collapse/expand cycle survives a later relayout', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 260 } });
            // collapsed before layout, so the held size is still outstanding
            shell.setEdgeGroupCollapsed(groups.left!, true);
            shell.layout(1000, 800);
            shell.setEdgeGroupCollapsed(groups.left!, false);

            // the user drags the sash
            (shell as any)._outerSplitview.resizeView(
                (shell as any)._leftIndex,
                400
            );
            // a later relayout must not resurrect the original size
            shell.layout(1000, 700);

            expect(sizeOf(shell, 'left')).toBe(400);
            shell.dispose();
        });

        test('a round-trip through toJSON/fromJSON keeps a size set before layout', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 260 } });
            shell.resizeEdgeGroup('left', 420);
            const state = shell.toJSON();
            shell.dispose();

            const fresh = makeShell({ left: { id: 'left', initialSize: 260 } });
            fresh.fromJSON(state);
            fresh.layout(1000, 800);

            expect(sizeOf(fresh, 'left')).toBe(420);
            fresh.dispose();
        });

        test('an unconfigured position, and a non-positive or non-finite size, are no-ops', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 260 } });
            shell.layout(1000, 800);

            const before = sizeOf(shell, 'left');

            expect(() => shell.resizeEdgeGroup('right', 200)).not.toThrow();

            shell.resizeEdgeGroup('left', 0);
            shell.resizeEdgeGroup('left', -100);
            shell.resizeEdgeGroup('left', Number.NaN);

            expect(sizeOf(shell, 'left')).toBe(before);
            shell.dispose();
        });
    });

    describe('stacks', () => {
        test('a second group keeps the edge when its sibling is removed', () => {
            const shell = makeShell({ left: { id: 'a', initialSize: 260 } });
            const b = makeGroup();
            shell.addEdgeView('left', { id: 'b' }, b);
            shell.layout(1000, 800);

            shell.removeEdgeView(groups.left!);

            expect(shell.hasEdgeGroup('left')).toBe(true);
            expect(
                stackOf(shell, 'left').members.map((m) => m.element)
            ).toEqual([b.element]);
            expect(shell.getStackMemberSize(b)).toBe(800);
            expect(shell.toJSON().left!.size).toBe(260);

            shell.removeEdgeView(b);
            expect(shell.hasEdgeGroup('left')).toBe(false);
            expect(shell.toJSON().left).toBeUndefined();
            shell.dispose();
        });

        test('toJSON keeps the single-group shape for one group and adds groups[] for more', () => {
            const shell = makeShell({ left: { id: 'a', initialSize: 260 } });
            shell.layout(1000, 800);
            const single = shell.toJSON().left!;
            expect(single).toEqual({
                size: 260,
                visible: true,
                collapsed: undefined,
                minimumSize: undefined,
                maximumSize: undefined,
                collapsedSize: 35,
            });
            expect('groups' in single).toBe(false);

            const b = makeGroup();
            shell.addEdgeView('left', { id: 'b' }, b, {
                relativeTo: groups.left,
                minimumSize: 120,
                maximumSize: 600,
            });
            shell.setEdgeGroupCollapsed(b, true);
            const stacked = shell.toJSON().left as SerializedEdgeStack;
            expect(stacked).toEqual({
                ...single,
                groups: [
                    {
                        size: 765,
                        collapsed: undefined,
                        minimumSize: undefined,
                        maximumSize: undefined,
                    },
                    {
                        size: 35,
                        collapsed: true,
                        minimumSize: 120,
                        maximumSize: 600,
                    },
                ],
            });
            shell.dispose();
        });

        test('fromJSON restores each member of a stack and the edge collapses only when every member is', () => {
            const shell = makeShell({ left: { id: 'a' } });
            const b = makeGroup();
            shell.addEdgeView('left', { id: 'b' }, b);
            shell.layout(1000, 800);

            shell.fromJSON({
                left: {
                    size: 300,
                    visible: true,
                    collapsed: true,
                    groups: [
                        { size: 500, collapsed: true },
                        { size: 300, collapsed: true },
                    ],
                },
            });
            expect(shell.isEdgeCollapsed('left')).toBe(true);
            expect(shell.isEdgeGroupCollapsed(groups.left!)).toBe(true);
            expect(shell.isEdgeGroupCollapsed(b)).toBe(true);
            expect(shell.getEdgeGroupExpandedSize('left')).toBe(300);

            shell.fromJSON({
                left: {
                    size: 300,
                    visible: true,
                    groups: [{ size: 500 }, { size: 300, collapsed: true }],
                },
            });
            expect(shell.isEdgeCollapsed('left')).toBe(false);
            expect(shell.isEdgeGroupCollapsed(b)).toBe(true);
            expect(shell.getStackMemberSize(groups.left!)).toBe(765);
            expect(shell.getStackMemberSize(b)).toBe(35);
            shell.dispose();
        });

        test('a member size restored before layout lands on the first layout', () => {
            const shell = makeShell({ left: { id: 'a' } });
            const b = makeGroup();
            shell.addEdgeView('left', { id: 'b' }, b);

            shell.fromJSON({
                left: {
                    size: 300,
                    visible: true,
                    groups: [{ size: 500 }, { size: 300 }],
                },
            });
            expect(shell.getStackMemberSize(b)).toBe(300);

            shell.layout(1000, 800);
            expect(shell.getStackMemberSize(groups.left!)).toBe(500);
            expect(shell.getStackMemberSize(b)).toBe(300);
            shell.dispose();
        });

        test('updateTheme propagates the gap to every stack', () => {
            const shell = makeShell({ left: { id: 'a' }, top: { id: 't' } });
            shell.updateTheme(10, 35);
            for (const position of ['left', 'top'] as const) {
                const inner = stackOf(shell, position).element.querySelector(
                    '.dv-split-view-container'
                )!;
                expect(
                    inner.classList.contains('dv-splitview-has-margin')
                ).toBe(true);
            }
            shell.updateTheme(0, 35);
            expect(
                stackOf(shell, 'left')
                    .element.querySelector('.dv-split-view-container')!
                    .classList.contains('dv-splitview-has-margin')
            ).toBe(false);
            shell.dispose();
        });
    });

    describe('toJSON', () => {
        test('includes visible: true and no collapsed field when not collapsed', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 250 } });
            const json = shell.toJSON();
            expect(json.left).toBeDefined();
            expect(json.left!.visible).toBe(true);
            expect(json.left!.collapsed).toBeUndefined();
            shell.dispose();
        });

        test('collapsed field is true when collapsed', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 250 } });
            shell.setEdgeGroupCollapsed(groups.left!, true);
            const json = shell.toJSON();
            expect(json.left!.collapsed).toBe(true);
            expect(typeof json.left!.size).toBe('number');
            shell.dispose();
        });

        test('visible is false after hiding the panel', () => {
            const shell = makeShell({ left: { id: 'left' } });
            shell.setEdgeGroupVisible('left', false);
            const json = shell.toJSON();
            expect(json.left!.visible).toBe(false);
            shell.dispose();
        });

        test('unconfigured positions are absent from the result', () => {
            const shell = makeShell({ left: { id: 'left' } });
            const json = shell.toJSON();
            expect(json.right).toBeUndefined();
            expect(json.top).toBeUndefined();
            expect(json.bottom).toBeUndefined();
            shell.dispose();
        });
    });

    describe('fromJSON', () => {
        test('restores hidden visibility state for left panel', () => {
            const shell = makeShell({ left: { id: 'left' } });
            shell.fromJSON({ left: { size: 200, visible: false } });
            expect(shell.isEdgeGroupVisible('left')).toBe(false);
            shell.dispose();
        });

        test('restores collapsed state for left panel', () => {
            const shell = makeShell({ left: { id: 'left' } });
            shell.fromJSON({
                left: { size: 200, visible: true, collapsed: true },
            });
            expect(shell.isEdgeCollapsed('left')).toBe(true);
            shell.dispose();
        });

        test('restores expanded size for collapsed left panel so expand uses saved size', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 300 } });
            shell.fromJSON({
                left: { size: 350, visible: true, collapsed: true },
            });
            expect(shell.isEdgeCollapsed('left')).toBe(true);
            const leftView = stackOf(shell, 'left');
            expect(leftView.lastExpandedSize).toBe(350);
            shell.dispose();
        });

        test('re-shows a hidden panel when the restored state is visible', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 260 } });
            shell.layout(1000, 800);
            shell.setEdgeGroupVisible('left', false);

            shell.fromJSON({ left: { size: 420, visible: true } });

            expect(shell.isEdgeGroupVisible('left')).toBe(true);
            expect(
                (shell as any)._outerSplitview.getViewSize(
                    (shell as any)._leftIndex
                )
            ).toBe(420);
            shell.dispose();
        });

        test('restores hidden visibility state for right panel', () => {
            const shell = makeShell({ right: { id: 'right' } });
            shell.fromJSON({ right: { size: 200, visible: false } });
            expect(shell.isEdgeGroupVisible('right')).toBe(false);
            shell.dispose();
        });

        test('restores hidden visibility state for top panel', () => {
            const shell = makeShell({ top: { id: 'top' } });
            shell.fromJSON({ top: { size: 200, visible: false } });
            expect(shell.isEdgeGroupVisible('top')).toBe(false);
            shell.dispose();
        });

        test('restores hidden visibility state for bottom panel', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } });
            shell.fromJSON({ bottom: { size: 200, visible: false } });
            expect(shell.isEdgeGroupVisible('bottom')).toBe(false);
            shell.dispose();
        });
    });

    describe('defaultCollapsedSize', () => {
        test('panels use defaultCollapsedSize when no per-panel collapsedSize is set', () => {
            const shell = makeShell({ left: { id: 'left' } }, 0, 48);
            const leftView = stackOf(shell, 'left');
            expect(leftView.collapsedSize).toBe(48);
            shell.dispose();
        });

        test('per-panel collapsedSize overrides defaultCollapsedSize', () => {
            const shell = makeShell(
                { left: { id: 'left', collapsedSize: 60 } },
                0,
                48
            );
            const leftView = stackOf(shell, 'left');
            expect(leftView.collapsedSize).toBe(60);
            shell.dispose();
        });

        test('applies to all four positions', () => {
            const shell = makeShell(
                {
                    top: { id: 'top' },
                    bottom: { id: 'bottom' },
                    left: { id: 'left' },
                    right: { id: 'right' },
                },
                0,
                48
            );
            expect(stackOf(shell, 'top').collapsedSize).toBe(48);
            expect(stackOf(shell, 'bottom').collapsedSize).toBe(48);
            expect(stackOf(shell, 'left').collapsedSize).toBe(48);
            expect(stackOf(shell, 'right').collapsedSize).toBe(48);
            shell.dispose();
        });
    });

    describe('gap adjustment', () => {
        test('gap is added to collapsedSize for all four positions', () => {
            // All 4 positions: outerN=3, innerN=3, gapAdd = gap*(n-1)/n = 10*2/3
            const shell = makeShell(
                {
                    top: { id: 'top' },
                    bottom: { id: 'bottom' },
                    left: { id: 'left' },
                    right: { id: 'right' },
                },
                10,
                44
            );
            const expected = 44 + (10 * 2) / 3; // ≈ 50.667
            expect(stackOf(shell, 'top').collapsedSize).toBeCloseTo(
                expected,
                5
            );
            expect(stackOf(shell, 'bottom').collapsedSize).toBeCloseTo(
                expected,
                5
            );
            expect(stackOf(shell, 'left').collapsedSize).toBeCloseTo(
                expected,
                5
            );
            expect(stackOf(shell, 'right').collapsedSize).toBeCloseTo(
                expected,
                5
            );
            shell.dispose();
        });

        test('gap is added on top of per-panel collapsedSize override', () => {
            // Only left configured: outerN=2, outerGapAdd = 10*1/2 = 5
            const shell = makeShell(
                { left: { id: 'left', collapsedSize: 60 } },
                10,
                44
            );
            // per-panel 60 + gapAdd 5 = 65
            expect(stackOf(shell, 'left').collapsedSize).toBe(65);
            shell.dispose();
        });

        test('gap is added to minimumSize when explicitly provided', () => {
            // Only left configured: outerN=2, outerGapAdd = 5
            const shell = makeShell(
                { left: { id: 'left', minimumSize: 100 } },
                10,
                44
            );
            // minimumSize 100 + gapAdd 5 = 105
            expect(stackOf(shell, 'left').minimumSize).toBe(105);
            shell.dispose();
        });

        test('minimumSize is NOT adjusted when not explicitly provided', () => {
            // Only top configured: innerN=2, innerGapAdd = 10*1/2 = 5
            const shell = makeShell({ top: { id: 'top' } }, 10, 44);
            // no minimumSize provided → defaults to collapsedSize + 50 = 49 + 50 = 99
            expect(stackOf(shell, 'top').minimumSize).toBe(99);
            shell.dispose();
        });
    });

    describe('dispose', () => {
        test('removes the shell element from the container', () => {
            const shell = makeShell({ left: { id: 'left' } });
            const shellEl = shell.element;
            expect(container.contains(shellEl)).toBe(true);
            shell.dispose();
            expect(container.contains(shellEl)).toBe(false);
        });

        test('shell is created even with no edge panels', () => {
            const shell = new ShellManager(
                container,
                dockviewElement,
                layoutGrid
            );
            expect(container.contains(shell.element)).toBe(true);
            shell.dispose();
            expect(container.contains(shell.element)).toBe(false);
        });
    });

    describe('updateTheme', () => {
        test('switching gap=0→10 updates collapsed sizes on all panels', () => {
            // Only left+right configured: outerN=3, outerGapAdd = 10*2/3
            // Only bottom configured:     innerN=2, innerGapAdd = 10*1/2 = 5
            const shell = makeShell(
                {
                    left: { id: 'left' },
                    right: { id: 'right' },
                    bottom: { id: 'bottom' },
                },
                0, // initial gap
                35 // initial defaultCollapsedSize
            );

            shell.updateTheme(10, 44);

            const outerGapAdd = (10 * 2) / 3; // ≈ 6.667
            const innerGapAdd = (10 * 1) / 2; // = 5

            expect(stackOf(shell, 'left').collapsedSize).toBeCloseTo(
                44 + outerGapAdd,
                5
            );
            expect(stackOf(shell, 'right').collapsedSize).toBeCloseTo(
                44 + outerGapAdd,
                5
            );
            expect(stackOf(shell, 'bottom').collapsedSize).toBe(
                44 + innerGapAdd
            );
            shell.dispose();
        });

        test('switching gap=10→0 resets collapsed sizes to the default', () => {
            // Only left configured: outerN=2, outerGapAdd = 10*1/2 = 5 initially
            const shell = makeShell({ left: { id: 'left' } }, 10, 44);

            // initial collapsed size = 44 + 5 = 49
            expect(stackOf(shell, 'left').collapsedSize).toBe(49);

            shell.updateTheme(0, 35);

            expect(stackOf(shell, 'left').collapsedSize).toBe(35);
            shell.dispose();
        });

        test('per-panel collapsedSize override is respected after updateTheme', () => {
            const shell = makeShell(
                { left: { id: 'left', collapsedSize: 40 } },
                0,
                35
            );

            shell.updateTheme(10, 44); // outerGapAdd = 10*1/2 = 5

            // original collapsedSize=40, gapAdd=5 → 45
            expect(stackOf(shell, 'left').collapsedSize).toBe(45);
            shell.dispose();
        });

        test('per-panel minimumSize is adjusted by new gapAdd after updateTheme', () => {
            const shell = makeShell(
                { left: { id: 'left', minimumSize: 100 } },
                0,
                35
            );

            shell.updateTheme(10, 44); // outerGapAdd = 5

            expect(stackOf(shell, 'left').minimumSize).toBe(105);
            shell.dispose();
        });

        test('minimumSize defaults to collapsedSize+50 when not provided after updateTheme', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } }, 0, 35);

            shell.updateTheme(10, 44); // innerN=2, innerGapAdd=5

            expect(stackOf(shell, 'bottom').collapsedSize).toBe(49);
            expect(stackOf(shell, 'bottom').minimumSize).toBe(99);
            shell.dispose();
        });

        test('updateTheme updates the outer splitview margin', () => {
            const shell = makeShell({ left: { id: 'left' } });
            shell.updateTheme(10, 44);
            expect((shell as any)._outerSplitview.margin).toBe(10);
            shell.dispose();
        });

        test('updateTheme updates the inner (middle column) splitview margin', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } });
            shell.updateTheme(10, 44);
            expect((shell as any)._middleColumn._splitview.margin).toBe(10);
            shell.dispose();
        });

        test('a currently-collapsed panel keeps isCollapsed=true after updateTheme', () => {
            const shell = makeShell({ left: { id: 'left' } }, 0, 35);
            shell.setEdgeGroupCollapsed(groups.left!, true);
            expect(shell.isEdgeCollapsed('left')).toBe(true);

            shell.updateTheme(10, 44);

            expect(shell.isEdgeCollapsed('left')).toBe(true);
            shell.dispose();
        });

        test('updateTheme is idempotent: calling twice with same args gives same result', () => {
            const shell = makeShell({ left: { id: 'left' } }, 0, 35);

            shell.updateTheme(10, 44);
            const sizeAfterFirst = stackOf(shell, 'left').collapsedSize;

            shell.updateTheme(10, 44);
            expect(stackOf(shell, 'left').collapsedSize).toBe(sizeAfterFirst);
            shell.dispose();
        });
    });

    describe('resize observer visibility guard (#1495)', () => {
        // Reproduces #1495: a nested dockview whose `onlyWhenVisible` host
        // panel is deactivated has its shell element hidden/detached, which
        // fires a (0, 0) resize. Without a visibility guard that zero size is
        // propagated to the edge-group splitview, clamping the edge group to
        // its minimum size and losing the user's sizing.
        let observerCallbacks: Array<(entries: any[]) => void>;
        let rAFCallbacks: FrameRequestCallback[];
        let originalResizeObserver: typeof window.ResizeObserver;

        beforeEach(() => {
            observerCallbacks = [];
            rAFCallbacks = [];

            originalResizeObserver = window.ResizeObserver;
            (window as any).ResizeObserver = class {
                constructor(cb: (entries: any[]) => void) {
                    observerCallbacks.push(cb);
                }
                observe(): void {
                    /* noop */
                }
                unobserve(): void {
                    /* noop */
                }
                disconnect(): void {
                    /* noop */
                }
            };

            jest.spyOn(window, 'requestAnimationFrame').mockImplementation(
                (cb) => {
                    rAFCallbacks.push(cb);
                    return rAFCallbacks.length;
                }
            );
        });

        afterEach(() => {
            window.ResizeObserver = originalResizeObserver;
            jest.restoreAllMocks();
        });

        function fireResize(width: number, height: number): void {
            for (const cb of observerCallbacks) {
                cb([{ contentRect: { width, height } }]);
            }
            const pending = [...rAFCallbacks];
            rAFCallbacks = [];
            for (const cb of pending) {
                cb(performance.now());
            }
        }

        function setVisible(shell: ShellManager, visible: boolean): void {
            // jsdom does not compute offsetParent; drive it explicitly so the
            // guard sees the shell as hidden (null) or visible (an element).
            Object.defineProperty(shell.element, 'offsetParent', {
                configurable: true,
                get: () => (visible ? document.body : null),
            });
        }

        // Build a shell with a real layout and an edge group sized to `size`
        // (as an established sash drag would leave it), returning the shell.
        function makeSizedShell(
            position: 'left' | 'right',
            size: number
        ): ShellManager {
            const shell = new ShellManager(
                container,
                dockviewElement,
                layoutGrid
            );
            setVisible(shell, true);
            fireResize(1000, 800);
            shell.addEdgeView(position, { id: position }, makeGroup());
            const splitview = (shell as any)._outerSplitview;
            const index =
                position === 'left'
                    ? (shell as any)._leftIndex
                    : (shell as any)._rightIndex;
            splitview.resizeView(index, size);
            return shell;
        }

        test('preserves the edge group size when the shell is hidden', () => {
            const shell = makeSizedShell('right', 300);
            expect(shell.toJSON().right!.size).toBe(300);

            // Host panel deactivates: element hidden → (0, 0) resize fires.
            setVisible(shell, false);
            fireResize(0, 0);

            // The size must be preserved, not clamped to the minimum.
            expect(shell.toJSON().right!.size).toBe(300);

            // Reactivating restores the same layout without any size change.
            setVisible(shell, true);
            fireResize(1000, 800);
            expect(shell.toJSON().right!.size).toBe(300);

            shell.dispose();
        });

        test('does not lay out at zero when detached from the document', () => {
            const shell = makeSizedShell('left', 250);
            expect(shell.toJSON().left!.size).toBe(250);

            // offsetParent stays truthy but the element leaves the document —
            // still a hidden/meaningless (0, 0) measurement.
            shell.element.remove();
            fireResize(0, 0);

            expect(shell.toJSON().left!.size).toBe(250);

            shell.dispose();
        });
    });
});
