import { fromPartial } from '@total-typescript/shoehorn';
import {
    ITabReorderHost,
    TabReorderController,
} from '../../../../dockview/components/titlebar/tabReorderController';
import { DockviewHeaderDirection } from '../../../../dockview/options';

/**
 * Unit coverage for the 2-D wrapped-strip hit-test
 * (`computeWrappedInsertionIndex`) across both axes: rows for a horizontal
 * header and columns for a vertical header. jsdom has no layout, so each tab's
 * rect is mocked. The full drag flow is exercised e2e; here we pin the pure
 * geometry.
 */
describe('TabReorderController wrapped insertion index', () => {
    type Rect = Pick<
        DOMRect,
        'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'
    >;

    const tab = (id: string, rect: Rect) => {
        const element = document.createElement('div');
        element.getBoundingClientRect = () => rect as DOMRect;
        return { value: { panel: { id }, element } };
    };

    function controllerFor(
        direction: DockviewHeaderDirection,
        tabItems: ReturnType<typeof tab>[]
    ): TabReorderController {
        const host = fromPartial<ITabReorderHost>({
            tabItems: tabItems as any,
            direction,
            tabsList: document.createElement('div'),
        });
        return new TabReorderController(host);
    }

    const call = (c: TabReorderController, x: number, y: number): number =>
        (c as any).computeWrappedInsertionIndex(x, y);

    describe('horizontal header (rows)', () => {
        // two rows of two tabs: row0 (top 0), row1 (top 30)
        const tabs = [
            tab('t0', {
                left: 0,
                right: 50,
                top: 0,
                bottom: 26,
                width: 50,
                height: 26,
            }),
            tab('t1', {
                left: 50,
                right: 100,
                top: 0,
                bottom: 26,
                width: 50,
                height: 26,
            }),
            tab('t2', {
                left: 0,
                right: 50,
                top: 30,
                bottom: 56,
                width: 50,
                height: 26,
            }),
            tab('t3', {
                left: 50,
                right: 100,
                top: 30,
                bottom: 56,
                width: 50,
                height: 26,
            }),
        ];

        test('picks the slot before a tab in the pointed-at row by x-midpoint', () => {
            const c = controllerFor('horizontal', tabs);
            // over row1 (y=40), left of t2's midpoint (x=25) → insert at t2 (2)
            expect(call(c, 10, 40)).toBe(2);
            c.dispose();
        });

        test('past all tabs in a row → after the row last tab', () => {
            const c = controllerFor('horizontal', tabs);
            // over row0 (y=10), past t0/t1 midpoints → after t1 (index 1 + 1)
            expect(call(c, 200, 10)).toBe(2);
            c.dispose();
        });

        test('a between-rows hover snaps to the nearest row, not the last', () => {
            const c = controllerFor('horizontal', tabs);
            // y=27 sits in the inter-row gap (26..30), closer to row0 → left of
            // t0's midpoint → 0
            expect(call(c, 5, 27)).toBe(0);
            c.dispose();
        });
    });

    describe('vertical header (columns)', () => {
        // two columns of two tabs with a gap (50..60): col0 (left 0), col1 (left 60)
        const tabs = [
            tab('t0', {
                left: 0,
                right: 50,
                top: 0,
                bottom: 26,
                width: 50,
                height: 26,
            }),
            tab('t1', {
                left: 0,
                right: 50,
                top: 30,
                bottom: 56,
                width: 50,
                height: 26,
            }),
            tab('t2', {
                left: 60,
                right: 110,
                top: 0,
                bottom: 26,
                width: 50,
                height: 26,
            }),
            tab('t3', {
                left: 60,
                right: 110,
                top: 30,
                bottom: 56,
                width: 50,
                height: 26,
            }),
        ];

        test('picks the slot before a tab in the pointed-at column by y-midpoint', () => {
            const c = controllerFor('vertical', tabs);
            // over col1 (x=80), above t2's midpoint (y=13) → insert at t2 (2)
            expect(call(c, 80, 10)).toBe(2);
            c.dispose();
        });

        test('past all tabs in a column → after the column last tab', () => {
            const c = controllerFor('vertical', tabs);
            // over col0 (x=10), past t0/t1 midpoints (y=200) → after t1 (1 + 1)
            expect(call(c, 10, 200)).toBe(2);
            c.dispose();
        });

        test('a between-columns hover snaps to the nearest column, not the last', () => {
            const c = controllerFor('vertical', tabs);
            // x=53 sits in the inter-column gap (50..60), closer to col0 → above
            // t0's midpoint → 0
            expect(call(c, 53, 5)).toBe(0);
            c.dispose();
        });

        test('empty strip returns the end index', () => {
            const c = controllerFor('vertical', []);
            expect(call(c, 10, 10)).toBe(0);
            c.dispose();
        });
    });

    describe('tab group target', () => {
        // one row: [chip X 0..20] a 20..70, b 70..120, c 120..170, then d
        // 170..220 outside the tab group; s 220..270 is dragged
        const row = (left: number, right: number) => ({
            left,
            right,
            top: 0,
            bottom: 26,
            width: right - left,
            height: 26,
        });
        const x = { id: 'x', panelIds: ['a', 'b', 'c'] };

        function controller(
            sourceTabId: string,
            members: string[] = x.panelIds,
            chipRect = row(0, 20)
        ): TabReorderController {
            const tabs = [
                tab('a', row(20, 70)),
                tab('b', row(70, 120)),
                tab('c', row(120, 170)),
                tab('d', row(170, 220)),
                tab('s', row(220, 270)),
            ];
            const tabGroup = { ...x, panelIds: members };
            const host = fromPartial<ITabReorderHost>({
                tabItems: tabs as any,
                direction: 'horizontal',
                tabsList: document.createElement('div'),
                tabGroupManager: {
                    chipRenderers: new Map([
                        [
                            'x',
                            {
                                chip: {
                                    element: {
                                        getBoundingClientRect: () => chipRect,
                                    },
                                },
                            },
                        ],
                    ]),
                } as any,
                groupPanel: {
                    model: {
                        getTabGroupForPanel: (id: string) =>
                            members.includes(id) ? tabGroup : undefined,
                    },
                } as any,
            });
            const c = new TabReorderController(host);
            c.beginDrag({
                sourceTabId,
                sourceIndex: tabs.findIndex(
                    (t) => t.value.panel.id === sourceTabId
                ),
            } as any);
            return c;
        }

        const target = (
            c: TabReorderController,
            index: number,
            x: number
        ): string | null => (c as any)._wrappedTargetTabGroup(index, x, 10);

        test('a slot between two members joins their tab group', () => {
            const c = controller('s');
            expect(target(c, 1, 60)).toBe('x');
            expect(target(c, 2, 110)).toBe('x');
            c.dispose();
        });

        test('the slot before the first member joins only past the chip', () => {
            const c = controller('s');
            expect(target(c, 0, 25)).toBe('x');
            expect(target(c, 0, 10)).toBeNull();
            // on another line
            expect((c as any)._wrappedTargetTabGroup(0, 25, 100)).toBeNull();
            c.dispose();
        });

        test('a chip shorter than the tabs is still on their line', () => {
            // the chip is centred on the line, so its top is below the tabs'
            const c = controller('s', x.panelIds, {
                ...row(0, 20),
                top: 6,
                bottom: 20,
                height: 14,
            });
            expect(target(c, 0, 10)).toBeNull();
            expect(target(c, 0, 25)).toBe('x');
            c.dispose();
        });

        test('a tab group whose chip is not rendered counts as passed', () => {
            const c = controller('s');
            const chips = (c as any).host.tabGroupManager.chipRenderers;
            chips.set('other', chips.get('x'));
            chips.delete('x');
            expect(target(c, 0, 10)).toBe('x');
            c.dispose();
        });

        test('a chip that ends the line before is passed', () => {
            // the chip wrapped onto the row above the tab group's first tab
            const c = controller('s', x.panelIds, {
                ...row(0, 20),
                top: -40,
                bottom: -21,
                height: 19,
            });
            expect(target(c, 0, 10)).toBe('x');
            c.dispose();
        });

        test('a wrapped drag over a slot between members marks it and its tab group', () => {
            const c = controller('s');
            const tabsList: HTMLElement = (c as any).host.tabsList;
            tabsList.classList.add('dv-tabs-container--wrap');
            const tabs = (c as any).host.tabItems;

            c.handleDragOver({ clientX: 60, clientY: 10 });

            expect(c.animState!.currentInsertionIndex).toBe(1);
            expect(c.animState!.targetTabGroupId).toBe('x');
            expect(
                tabs[1].value.element.classList.contains(
                    'dv-tab--reorder-before'
                )
            ).toBe(true);

            // the same slot again changes nothing
            tabs[1].value.element.classList.remove('dv-tab--reorder-before');
            c.handleDragOver({ clientX: 61, clientY: 10 });
            expect(
                tabs[1].value.element.classList.contains(
                    'dv-tab--reorder-before'
                )
            ).toBe(false);
            c.dispose();
        });

        test('a slot after the last member stays outside', () => {
            const c = controller('s');
            expect(target(c, 3, 160)).toBeNull();
            expect(target(c, 4, 210)).toBeNull();
            c.dispose();
        });

        test('a last member released at its own slot stays in its tab group', () => {
            const c = controller('c');
            expect(target(c, 2, 140)).toBe('x');
            expect(target(c, 3, 160)).toBe('x');
            expect(target(c, 4, 210)).toBeNull();
            c.dispose();
        });

        test('a lone member released at its own slot stays only past the chip', () => {
            const c = controller('a', ['a']);
            expect(target(c, 0, 25)).toBe('x');
            expect(target(c, 0, 10)).toBeNull();
            c.dispose();
        });
    });
});
