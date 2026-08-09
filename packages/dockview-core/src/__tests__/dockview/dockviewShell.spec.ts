import {
    EdgeGroupView,
    EdgeGroupOptions,
    IEdgeGroupHost,
    ShellManager,
} from '../../dockview/dockviewShell';

function makeGroup(): IEdgeGroupHost & { layout: jest.Mock } {
    return {
        element: document.createElement('div'),
        layout: jest.fn(),
    };
}

describe('EdgeGroupView', () => {
    describe('construction', () => {
        test('collapsedSize defaults to 35', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            expect(view.collapsedSize).toBe(35);
        });

        test('expandedMinimumSize = collapsedSize + 50 when minimumSize not provided', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 30 },
                group,
                'horizontal'
            );
            // minimumSize when not collapsed = expandedMinimumSize = 30 + 50 = 80
            expect(view.minimumSize).toBe(80);
        });

        test('expandedMinimumSize = provided minimumSize when given', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', minimumSize: 100 },
                group,
                'horizontal'
            );
            expect(view.minimumSize).toBe(100);
        });

        test('lastExpandedSize defaults to 200 when initialSize not provided', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            expect(view.lastExpandedSize).toBe(200);
        });

        test('lastExpandedSize = provided initialSize', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', initialSize: 350 },
                group,
                'horizontal'
            );
            expect(view.lastExpandedSize).toBe(350);
        });

        test('adds dv-edge-group CSS class to group element', () => {
            const group = makeGroup();
            new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            expect(group.element.classList.contains('dv-edge-group')).toBe(
                true
            );
        });

        test('sets data-testid = dv-edge-group-<id>', () => {
            const group = makeGroup();
            new EdgeGroupView({ id: 'my-panel' }, group, 'horizontal');
            expect(group.element.dataset.testid).toBe('dv-edge-group-my-panel');
        });

        test('isCollapsed is true when collapsed option is true', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsed: true },
                group,
                'horizontal'
            );
            expect(view.isCollapsed).toBe(true);
            expect(group.element.classList.contains('dv-edge-collapsed')).toBe(
                true
            );
        });
    });

    describe('minimumSize getter', () => {
        test('returns collapsedSize when collapsed', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 40 },
                group,
                'horizontal'
            );
            view.setCollapsed(true);
            expect(view.minimumSize).toBe(40);
        });

        test('returns expandedMinimumSize when expanded', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 40, minimumSize: 120 },
                group,
                'horizontal'
            );
            expect(view.minimumSize).toBe(120);
        });
    });

    describe('maximumSize getter', () => {
        test('returns collapsedSize when collapsed', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 40 },
                group,
                'horizontal'
            );
            view.setCollapsed(true);
            expect(view.maximumSize).toBe(40);
        });

        test('returns Infinity when expanded and maximumSize not provided', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            expect(view.maximumSize).toBe(Number.POSITIVE_INFINITY);
        });

        test('returns provided expandedMaximumSize when expanded', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', maximumSize: 600 },
                group,
                'horizontal'
            );
            expect(view.maximumSize).toBe(600);
        });
    });

    describe('setCollapsed', () => {
        test('setCollapsed(true): isCollapsed becomes true and adds dv-edge-collapsed class', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            view.setCollapsed(true);
            expect(view.isCollapsed).toBe(true);
            expect(group.element.classList.contains('dv-edge-collapsed')).toBe(
                true
            );
        });

        test('setCollapsed(false): isCollapsed becomes false and removes dv-edge-collapsed class', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            view.setCollapsed(true);
            view.setCollapsed(false);
            expect(view.isCollapsed).toBe(false);
            expect(group.element.classList.contains('dv-edge-collapsed')).toBe(
                false
            );
        });

        test('setCollapsed(true) twice is a no-op on the second call', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            view.setCollapsed(true);
            const afterFirst = view.isCollapsed;
            view.setCollapsed(true);
            expect(view.isCollapsed).toBe(afterFirst);
        });
    });

    describe('layout', () => {
        test('horizontal: calls group.layout(size, orthogonalSize)', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'horizontal');
            view.layout(250, 800);
            expect(group.layout).toHaveBeenCalledWith(250, 800);
        });

        test('vertical: calls group.layout(orthogonalSize, size)', () => {
            const group = makeGroup();
            const view = new EdgeGroupView({ id: 'test' }, group, 'vertical');
            view.layout(200, 900);
            // vertical: size=height, orthogonalSize=width → layout(width, height)
            expect(group.layout).toHaveBeenCalledWith(900, 200);
        });

        test('when not collapsed: updates lastExpandedSize', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', initialSize: 200 },
                group,
                'horizontal'
            );
            view.layout(350, 800);
            expect(view.lastExpandedSize).toBe(350);
        });

        test('when collapsed: does NOT update lastExpandedSize', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', initialSize: 200 },
                group,
                'horizontal'
            );
            view.setCollapsed(true);
            view.layout(35, 800);
            expect(view.lastExpandedSize).toBe(200);
        });
    });

    describe('tab-strip size tracking', () => {
        test('a measured tab size wins over the configured collapsed size', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 44 },
                group,
                'vertical'
            );
            expect(view.collapsedSize).toBe(44);

            // Simulate the tab strip growing (as when the
            // --dv-tabs-and-actions-container-height CSS variable is bumped).
            (view as any)._applyMeasuredTabSize(60);
            expect(view.collapsedSize).toBe(60);
        });

        test('the measured tab size is added to the gap contribution', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 44 },
                group,
                'vertical',
                5
            );
            expect(view.collapsedSize).toBe(49);

            (view as any)._applyMeasuredTabSize(60);
            expect(view.collapsedSize).toBe(65);
        });

        test('when collapsed: a measured tab size resizes via onDidChange', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 44 },
                group,
                'vertical'
            );
            view.setCollapsed(true);

            const sizes: (number | undefined)[] = [];
            view.onDidChange((e) => sizes.push(e.size));

            (view as any)._applyMeasuredTabSize(60);

            expect(sizes).toEqual([60]);
            expect(view.minimumSize).toBe(60);
            expect(view.maximumSize).toBe(60);
        });

        test('when expanded: a measured tab size does NOT fire onDidChange', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 44 },
                group,
                'vertical'
            );

            const sizes: (number | undefined)[] = [];
            view.onDidChange((e) => sizes.push(e.size));

            (view as any)._applyMeasuredTabSize(60);

            expect(sizes).toEqual([]);
            // but a later collapse uses the measured size
            expect(view.collapsedSize).toBe(60);
        });

        test('a zero or unchanged measurement is ignored', () => {
            const group = makeGroup();
            const view = new EdgeGroupView(
                { id: 'test', collapsedSize: 44 },
                group,
                'vertical'
            );
            view.setCollapsed(true);

            const sizes: (number | undefined)[] = [];
            view.onDidChange((e) => sizes.push(e.size));

            (view as any)._applyMeasuredTabSize(0);
            (view as any)._applyMeasuredTabSize(60);
            (view as any)._applyMeasuredTabSize(60);

            expect(sizes).toEqual([60]);
        });
    });
});

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
        for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
            if (config[pos]) {
                shell.addEdgeView(pos, config[pos]!, makeGroup());
            }
        }
        return shell;
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

        test('addEdgeView throws when position already registered', () => {
            const shell = new ShellManager(
                container,
                dockviewElement,
                layoutGrid
            );
            shell.addEdgeView('left', { id: 'left' }, makeGroup());
            expect(() =>
                shell.addEdgeView('left', { id: 'left-2' }, makeGroup())
            ).toThrow();
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
            expect(shell.isEdgeGroupCollapsed('left')).toBe(false);
            shell.setEdgeGroupCollapsed('left', true);
            expect(shell.isEdgeGroupCollapsed('left')).toBe(true);
            shell.setEdgeGroupCollapsed('left', false);
            expect(shell.isEdgeGroupCollapsed('left')).toBe(false);
            shell.dispose();
        });

        test('collapse right panel', () => {
            const shell = makeShell({ right: { id: 'right' } });
            shell.setEdgeGroupCollapsed('right', true);
            expect(shell.isEdgeGroupCollapsed('right')).toBe(true);
            shell.dispose();
        });

        test('collapse top panel', () => {
            const shell = makeShell({ top: { id: 'top' } });
            shell.setEdgeGroupCollapsed('top', true);
            expect(shell.isEdgeGroupCollapsed('top')).toBe(true);
            shell.dispose();
        });

        test('collapse bottom panel', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } });
            shell.setEdgeGroupCollapsed('bottom', true);
            expect(shell.isEdgeGroupCollapsed('bottom')).toBe(true);
            shell.dispose();
        });

        test('collapse unconfigured position is a no-op', () => {
            const shell = makeShell({});
            expect(() =>
                shell.setEdgeGroupCollapsed('left', true)
            ).not.toThrow();
            expect(shell.isEdgeGroupCollapsed('left')).toBe(false);
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
            shell.setEdgeGroupCollapsed('left', true);
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
            expect(shell.isEdgeGroupCollapsed('left')).toBe(true);
            shell.dispose();
        });

        test('restores expanded size for collapsed left panel so expand uses saved size', () => {
            const shell = makeShell({ left: { id: 'left', initialSize: 300 } });
            shell.fromJSON({
                left: { size: 350, visible: true, collapsed: true },
            });
            expect(shell.isEdgeGroupCollapsed('left')).toBe(true);
            const leftView = (shell as any)._leftView as EdgeGroupView;
            expect(leftView.lastExpandedSize).toBe(350);
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
            const leftView = (shell as any)._leftView as EdgeGroupView;
            expect(leftView.collapsedSize).toBe(48);
            shell.dispose();
        });

        test('per-panel collapsedSize overrides defaultCollapsedSize', () => {
            const shell = makeShell(
                { left: { id: 'left', collapsedSize: 60 } },
                0,
                48
            );
            const leftView = (shell as any)._leftView as EdgeGroupView;
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
            expect((shell as any)._topView.collapsedSize).toBe(48);
            expect((shell as any)._bottomView.collapsedSize).toBe(48);
            expect((shell as any)._leftView.collapsedSize).toBe(48);
            expect((shell as any)._rightView.collapsedSize).toBe(48);
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
            expect((shell as any)._topView.collapsedSize).toBeCloseTo(
                expected,
                5
            );
            expect((shell as any)._bottomView.collapsedSize).toBeCloseTo(
                expected,
                5
            );
            expect((shell as any)._leftView.collapsedSize).toBeCloseTo(
                expected,
                5
            );
            expect((shell as any)._rightView.collapsedSize).toBeCloseTo(
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
            expect((shell as any)._leftView.collapsedSize).toBe(65);
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
            expect((shell as any)._leftView.minimumSize).toBe(105);
            shell.dispose();
        });

        test('minimumSize is NOT adjusted when not explicitly provided', () => {
            // Only top configured: innerN=2, innerGapAdd = 10*1/2 = 5
            const shell = makeShell({ top: { id: 'top' } }, 10, 44);
            // no minimumSize provided → defaults to collapsedSize + 50 = 49 + 50 = 99
            expect((shell as any)._topView.minimumSize).toBe(99);
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

            expect((shell as any)._leftView.collapsedSize).toBeCloseTo(
                44 + outerGapAdd,
                5
            );
            expect((shell as any)._rightView.collapsedSize).toBeCloseTo(
                44 + outerGapAdd,
                5
            );
            expect((shell as any)._bottomView.collapsedSize).toBe(
                44 + innerGapAdd
            );
            shell.dispose();
        });

        test('switching gap=10→0 resets collapsed sizes to the default', () => {
            // Only left configured: outerN=2, outerGapAdd = 10*1/2 = 5 initially
            const shell = makeShell({ left: { id: 'left' } }, 10, 44);

            // initial collapsed size = 44 + 5 = 49
            expect((shell as any)._leftView.collapsedSize).toBe(49);

            shell.updateTheme(0, 35);

            expect((shell as any)._leftView.collapsedSize).toBe(35);
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
            expect((shell as any)._leftView.collapsedSize).toBe(45);
            shell.dispose();
        });

        test('per-panel minimumSize is adjusted by new gapAdd after updateTheme', () => {
            const shell = makeShell(
                { left: { id: 'left', minimumSize: 100 } },
                0,
                35
            );

            shell.updateTheme(10, 44); // outerGapAdd = 5

            expect((shell as any)._leftView.minimumSize).toBe(105);
            shell.dispose();
        });

        test('minimumSize defaults to collapsedSize+50 when not provided after updateTheme', () => {
            const shell = makeShell({ bottom: { id: 'bottom' } }, 0, 35);

            shell.updateTheme(10, 44); // innerN=2, innerGapAdd=5

            expect((shell as any)._bottomView.collapsedSize).toBe(49);
            expect((shell as any)._bottomView.minimumSize).toBe(99);
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
            shell.setEdgeGroupCollapsed('left', true);
            expect(shell.isEdgeGroupCollapsed('left')).toBe(true);

            shell.updateTheme(10, 44);

            expect(shell.isEdgeGroupCollapsed('left')).toBe(true);
            shell.dispose();
        });

        test('updateTheme is idempotent: calling twice with same args gives same result', () => {
            const shell = makeShell({ left: { id: 'left' } }, 0, 35);

            shell.updateTheme(10, 44);
            const sizeAfterFirst = (shell as any)._leftView.collapsedSize;

            shell.updateTheme(10, 44);
            expect((shell as any)._leftView.collapsedSize).toBe(sizeAfterFirst);
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
