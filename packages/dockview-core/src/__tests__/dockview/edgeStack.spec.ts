import { EdgeGroupView, EdgeStackView } from '../../dockview/edgeStack';
import {
    EdgeGroupOptions,
    EdgeGroupPosition,
    IEdgeGroupHost,
} from '../../dockview/dockviewShell';

function makeGroup(): IEdgeGroupHost & { layout: jest.Mock } {
    const element = document.createElement('div');
    const strip = document.createElement('div');
    strip.className = 'dv-tabs-and-actions-container';
    element.appendChild(strip);
    return { element, layout: jest.fn() };
}

function makeStack(
    position: EdgeGroupPosition = 'left',
    options: Partial<{
        initialSize: number;
        defaultCollapsedSize: number;
        gapAdd: number;
        gap: number;
    }> = {}
): EdgeStackView {
    return new EdgeStackView(position, {
        initialSize: 200,
        defaultCollapsedSize: 35,
        gapAdd: 0,
        gap: 0,
        ...options,
    });
}

function member(
    options: Partial<EdgeGroupOptions> & { id: string },
    position: EdgeGroupPosition = 'left',
    group: IEdgeGroupHost = makeGroup(),
    defaultCollapsedSize = 35
): EdgeGroupView {
    return new EdgeGroupView(options, group, position, defaultCollapsedSize);
}

/** jsdom lays nothing out, so a strip measurement is driven by hand. */
function measureStrip(
    view: EdgeGroupView,
    thickness: number,
    length: number
): void {
    (view as any)._applyStripSize(thickness, length);
}

describe('EdgeGroupView (stack member)', () => {
    test('adds dv-edge-group CSS class and data-testid to the group element', () => {
        const group = makeGroup();
        member({ id: 'my-panel' }, 'left', group);
        expect(group.element.classList.contains('dv-edge-group')).toBe(true);
        expect(group.element.dataset.testid).toBe('dv-edge-group-my-panel');
    });

    test('isCollapsed is true when collapsed option is true', () => {
        const group = makeGroup();
        const view = member({ id: 'test', collapsed: true }, 'left', group);
        expect(view.isCollapsed).toBe(true);
        expect(group.element.classList.contains('dv-edge-collapsed')).toBe(
            true
        );
    });

    test('setCollapsed toggles isCollapsed and the dv-edge-collapsed class', () => {
        const group = makeGroup();
        const view = member({ id: 'test' }, 'left', group);
        view.setCollapsed(true);
        expect(view.isCollapsed).toBe(true);
        expect(group.element.classList.contains('dv-edge-collapsed')).toBe(
            true
        );
        view.setCollapsed(false);
        expect(view.isCollapsed).toBe(false);
        expect(group.element.classList.contains('dv-edge-collapsed')).toBe(
            false
        );
    });

    test('configured thickness constraints are exposed for the stack and serialization', () => {
        const view = member(
            {
                id: 'test',
                minimumSize: 100,
                maximumSize: 400,
                collapsedSize: 30,
            },
            'left'
        );
        expect(view.configuredMinimumSize).toBe(100);
        expect(view.configuredMaximumSize).toBe(400);
        expect(view.configuredCollapsedSize).toBe(30);
        expect(view.expandedMinimumThickness).toBe(100);
    });

    test('collapsedSize defaults to the stack default and expanded minimum to collapsed + 50', () => {
        const view = member({ id: 'test' }, 'left', makeGroup(), 48);
        expect(view.configuredCollapsedSize).toBe(48);
        expect(view.collapsedThickness).toBe(48);
        expect(view.expandedMinimumThickness).toBe(98);
        view.updateDefaultCollapsedSize(40);
        expect(view.configuredCollapsedSize).toBe(40);
    });

    test('a measured strip thickness wins over the configured collapsed size', () => {
        const view = member({ id: 'test', collapsedSize: 30 }, 'left');
        measureStrip(view, 44, 120);
        expect(view.collapsedThickness).toBe(44);
        expect(view.stripLength).toBe(120);
    });

    test('a zero or unchanged measurement is ignored', () => {
        const view = member({ id: 'test' }, 'left');
        const listener = jest.fn();
        view.onDidStripChange(listener);
        measureStrip(view, 0, 0);
        expect(listener).not.toHaveBeenCalled();
        measureStrip(view, 40, 100);
        measureStrip(view, 40, 100);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
            thickness: true,
            length: true,
        });
    });

    describe('layout', () => {
        test.each([
            ['left', 'width'],
            ['right', 'width'],
        ] as const)('%s: the along axis is height', (position) => {
            const group = makeGroup();
            const view = member({ id: 'test' }, position, group);
            // inner splitview: size = along (height), orthogonal = thickness (width)
            view.layout(300, 220);
            expect(group.layout).toHaveBeenCalledWith(220, 300);
        });

        test.each([
            'top',
            'bottom',
        ] as const)('%s: the along axis is width', (position) => {
            const group = makeGroup();
            const view = member({ id: 'test' }, position, group);
            view.layout(300, 180);
            expect(group.layout).toHaveBeenCalledWith(300, 180);
        });

        test('records the along-axis size unless pinned to its strip', () => {
            const view = member({ id: 'test' }, 'left');
            view.layout(300, 220);
            expect(view.lastExpandedSize).toBe(300);
            view.setLockedToStrip(true);
            view.layout(35, 220);
            expect(view.lastExpandedSize).toBe(300);
        });
    });

    describe('along-axis constraints', () => {
        test('a lone member carries no minimum', () => {
            const view = member({ id: 'test' }, 'left');
            expect(view.minimumSize).toBe(0);
            expect(view.maximumSize).toBe(Number.POSITIVE_INFINITY);
        });

        test('with siblings the default minimum is the strip length + 50', () => {
            const view = member({ id: 'test' }, 'left');
            view.setHasSiblings(true);
            expect(view.minimumSize).toBe(85);
            measureStrip(view, 35, 60);
            expect(view.minimumSize).toBe(110);
        });

        test('configured along-axis constraints win', () => {
            const view = new EdgeGroupView(
                { id: 'test' },
                makeGroup(),
                'left',
                35,
                { minimumSize: 120, maximumSize: 500 }
            );
            view.setHasSiblings(true);
            expect(view.minimumSize).toBe(120);
            expect(view.maximumSize).toBe(500);
            expect(view.alongMinimumSize).toBe(120);
            expect(view.alongMaximumSize).toBe(500);
        });

        test('pinned to its strip, min and max are the strip length', () => {
            const view = member({ id: 'test' }, 'left');
            measureStrip(view, 35, 72);
            view.setLockedToStrip(true);
            expect(view.minimumSize).toBe(72);
            expect(view.maximumSize).toBe(72);
        });
    });
});

describe('EdgeStackView', () => {
    describe('a single member', () => {
        test('collapsedSize defaults to 35 and the expanded minimum to collapsedSize + 50', () => {
            const stack = makeStack();
            stack.addMember(member({ id: 'a' }));
            expect(stack.collapsedSize).toBe(35);
            expect(stack.minimumSize).toBe(85);
            expect(stack.maximumSize).toBe(Number.POSITIVE_INFINITY);
            stack.dispose();
        });

        test('an explicit minimumSize and maximumSize are respected', () => {
            const stack = makeStack();
            stack.addMember(
                member({ id: 'a', minimumSize: 100, maximumSize: 400 })
            );
            expect(stack.minimumSize).toBe(100);
            expect(stack.maximumSize).toBe(400);
            stack.dispose();
        });

        test('lastExpandedSize is the initial size until laid out', () => {
            const stack = makeStack('left', { initialSize: 350 });
            stack.addMember(member({ id: 'a' }));
            expect(stack.lastExpandedSize).toBe(350);
            stack.layout(260, 800);
            expect(stack.lastExpandedSize).toBe(260);
            stack.dispose();
        });

        test('when collapsed, min and max lock to collapsedSize and lastExpandedSize is kept', () => {
            const stack = makeStack();
            const a = member({ id: 'a', collapsedSize: 40 });
            stack.addMember(a);
            stack.layout(260, 800);
            stack.setMemberCollapsed(a, true);
            expect(stack.isCollapsed).toBe(true);
            expect(stack.minimumSize).toBe(40);
            expect(stack.maximumSize).toBe(40);
            stack.layout(40, 800);
            expect(stack.lastExpandedSize).toBe(260);
            stack.dispose();
        });

        test('the gap contribution is added to collapsedSize and an explicit minimumSize only', () => {
            const stack = makeStack('left', { gapAdd: 5 });
            stack.addMember(member({ id: 'a', minimumSize: 100 }));
            expect(stack.collapsedSize).toBe(40);
            expect(stack.minimumSize).toBe(105);
            stack.updateSizing(44, 0);
            expect(stack.collapsedSize).toBe(44);
            stack.dispose();
        });

        test('when collapsed: a measured strip thickness resizes via onDidChange', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            stack.addMember(a);
            stack.setMemberCollapsed(a, true);
            const listener = jest.fn();
            stack.onDidChange(listener);
            measureStrip(a, 44, 100);
            expect(listener).toHaveBeenCalledWith({ size: 44 });
            stack.dispose();
        });

        test('when expanded: a measured strip does not fire onDidChange', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            stack.addMember(a);
            const listener = jest.fn();
            stack.onDidChange(listener);
            measureStrip(a, 44, 100);
            expect(listener).not.toHaveBeenCalled();
            stack.dispose();
        });

        test('a collapsed edge only follows a thickness change, not a length change', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            stack.addMember(a);
            stack.setMemberCollapsed(a, true);
            measureStrip(a, 44, 100);
            const listener = jest.fn();
            stack.onDidChange(listener);
            measureStrip(a, 44, 160);
            expect(listener).not.toHaveBeenCalled();
            stack.dispose();
        });

        test('layout maps the outer axes onto the group for all four positions', () => {
            for (const position of ['left', 'right'] as const) {
                const group = makeGroup();
                const stack = makeStack(position);
                stack.addMember(member({ id: 'a' }, position, group));
                // outer: size = thickness (width), orthogonal = height
                stack.layout(220, 600);
                expect(group.layout).toHaveBeenLastCalledWith(220, 600);
                stack.dispose();
            }
            for (const position of ['top', 'bottom'] as const) {
                const group = makeGroup();
                const stack = makeStack(position);
                stack.addMember(member({ id: 'a' }, position, group));
                // middle column: size = thickness (height), orthogonal = width
                stack.layout(180, 900);
                expect(group.layout).toHaveBeenLastCalledWith(900, 180);
                stack.dispose();
            }
        });
    });

    describe('aggregate constraints', () => {
        test('thickness minimum is the widest, maximum the narrowest, collapsed the widest strip', () => {
            const stack = makeStack();
            const a = member({
                id: 'a',
                minimumSize: 120,
                maximumSize: 500,
                collapsedSize: 30,
            });
            const b = member({
                id: 'b',
                minimumSize: 160,
                maximumSize: 400,
                collapsedSize: 44,
            });
            stack.addMember(a);
            stack.addMember(b);
            expect(stack.minimumSize).toBe(160);
            expect(stack.maximumSize).toBe(400);
            expect(stack.collapsedSize).toBe(44);

            stack.removeMember(b);
            expect(stack.minimumSize).toBe(120);
            expect(stack.maximumSize).toBe(500);
            expect(stack.collapsedSize).toBe(30);
            stack.dispose();
        });

        test('isCollapsed only when every member is', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.addMember(b);
            stack.setMemberCollapsed(a, true);
            expect(stack.isCollapsed).toBe(false);
            stack.setMemberCollapsed(b, true);
            expect(stack.isCollapsed).toBe(true);
            stack.setMemberCollapsed(a, false);
            expect(stack.isCollapsed).toBe(false);
            stack.dispose();
        });
    });

    describe('members', () => {
        test('addMember places before, after or at an index', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            const c = member({ id: 'c' });
            const d = member({ id: 'd' });
            stack.addMember(a);
            stack.addMember(b, { relativeTo: a, placement: 'before' });
            stack.addMember(c, { relativeTo: a, placement: 'after' });
            stack.addMember(d, { index: 1 });
            expect(stack.members).toEqual([b, d, a, c]);
            expect(stack.indexOf(c)).toBe(3);
            stack.dispose();
        });

        test('a member placed next to a sibling takes half of its length', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            stack.addMember(a);
            stack.layout(220, 800);
            expect(stack.getMemberSize(a)).toBe(800);

            const b = member({ id: 'b' });
            stack.addMember(b, { relativeTo: a, placement: 'after' });
            expect(stack.getMemberSize(a)).toBe(400);
            expect(stack.getMemberSize(b)).toBe(400);
            stack.dispose();
        });

        test('an explicit size wins over the split', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            stack.addMember(a);
            stack.layout(220, 800);
            const b = member({ id: 'b' });
            stack.addMember(b, { relativeTo: a, placement: 'after' }, 300);
            expect(stack.getMemberSize(b)).toBe(300);
            expect(stack.getMemberSize(a)).toBe(500);
            stack.dispose();
        });

        test('a size requested before layout lands on the first layout', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.addMember(b);
            stack.resizeMember(b, 300);
            expect(stack.getMemberSize(b)).toBe(300);
            stack.layout(220, 800);
            expect(stack.getMemberSize(b)).toBe(300);
            expect(stack.getMemberSize(a)).toBe(500);
            stack.dispose();
        });

        test('moveMember reorders and keeps sizes', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.addMember(b);
            stack.layout(220, 800);
            stack.resizeMember(b, 300);
            stack.moveMember(b, 0);
            expect(stack.members).toEqual([b, a]);
            expect(stack.getMemberSize(b)).toBe(300);
            expect(stack.getMemberSize(a)).toBe(500);
            stack.dispose();
        });

        test('removeMember disposes the member and gives its room to the rest', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.addMember(b);
            stack.layout(220, 800);
            const dispose = jest.spyOn(b, 'dispose');
            stack.removeMember(b);
            expect(dispose).toHaveBeenCalledTimes(1);
            expect(stack.members).toEqual([a]);
            expect(stack.getMemberSize(a)).toBe(800);
            stack.dispose();
        });
    });

    describe('collapsing a member', () => {
        test('pins it to its strip length and its sibling takes the rest', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.layout(220, 800);
            stack.addMember(b);
            expect(stack.getMemberSize(a)).toBe(400);
            measureStrip(a, 35, 70);

            stack.setMemberCollapsed(a, true);

            expect(stack.isCollapsed).toBe(false);
            expect(stack.getMemberSize(a)).toBe(70);
            expect(stack.getMemberSize(b)).toBe(730);
            expect(a.minimumSize).toBe(70);
            expect(a.maximumSize).toBe(70);

            stack.setMemberCollapsed(a, false);
            expect(stack.getMemberSize(a)).toBe(400);
            expect(stack.getMemberSize(b)).toBe(400);
            stack.dispose();
        });

        test('a later strip length change re-pins a collapsed member', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.layout(220, 800);
            stack.addMember(b);
            measureStrip(a, 35, 70);
            stack.setMemberCollapsed(a, true);

            measureStrip(a, 35, 105);
            expect(stack.getMemberSize(a)).toBe(105);
            expect(stack.getMemberSize(b)).toBe(695);
            stack.dispose();
        });

        test('inner sashes are disabled while the whole edge is collapsed', () => {
            const stack = makeStack();
            const a = member({ id: 'a' });
            const b = member({ id: 'b' });
            stack.addMember(a);
            stack.addMember(b);
            const splitview = stack.element.querySelector(
                '.dv-split-view-container'
            )!;
            stack.setMemberCollapsed(a, true);
            expect(splitview.classList.contains('dv-splitview-disabled')).toBe(
                false
            );
            stack.setMemberCollapsed(b, true);
            expect(splitview.classList.contains('dv-splitview-disabled')).toBe(
                true
            );
            // a collapsed edge releases the pin: members keep their lengths
            expect(a.minimumSize).toBe(85);
            stack.setMemberCollapsed(b, false);
            expect(splitview.classList.contains('dv-splitview-disabled')).toBe(
                false
            );
            stack.dispose();
        });

        test('the stack element carries its position and test id', () => {
            const stack = makeStack('bottom');
            expect(stack.element.classList.contains('dv-edge-stack')).toBe(
                true
            );
            expect(stack.element.dataset.position).toBe('bottom');
            expect(stack.element.dataset.testid).toBe('dv-edge-stack-bottom');
            stack.dispose();
        });

        test('one sash sits between each pair of members', () => {
            const stack = makeStack();
            stack.addMember(member({ id: 'a' }));
            expect(stack.sashElements).toHaveLength(0);
            stack.addMember(member({ id: 'b' }));
            stack.addMember(member({ id: 'c' }));
            expect(stack.sashElements).toHaveLength(2);
            stack.dispose();
        });
    });
});
