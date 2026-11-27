import { test, expect, Page } from '@playwright/test';

/**
 * Tab strip behaviour end to end: reordering, tab groups, pinned tabs,
 * placement through the API and persistence, across both drag backends and
 * both tab animations. Each tab's title is its panel id, and every id has the
 * same length, so tabs are the same width.
 */

type Mode = { dnd: 'html5' | 'pointer'; smooth: boolean };

const MODES: Mode[] = [
    { dnd: 'pointer', smooth: false },
    { dnd: 'pointer', smooth: true },
    { dnd: 'html5', smooth: false },
    { dnd: 'html5', smooth: true },
];

const label = ({ dnd, smooth }: Mode) =>
    `[${dnd}${smooth ? ', smooth' : ''}]`;

async function open(page: Page, mode: Mode, extra = ''): Promise<void> {
    const query = [`dnd=${mode.dnd}`, mode.smooth ? 'smooth=1' : '', extra]
        .filter(Boolean)
        .join('&');
    await page.goto(`/e2e/fixtures/index.html?${query}`);
    await page.waitForFunction(() => (window as any).__ready === true);
}

/** Add one group of panels titled by id; `tabGroup` ids join a tab group
 *  labelled X. Returns the group id. */
async function setup(
    page: Page,
    ids: string[],
    tabGroup: string[] = []
): Promise<string> {
    const groupId = await page.evaluate(
        ({ ids, tabGroup }) => {
            const dv = (window as any).__dockview;
            for (const id of ids) {
                dv.addPanel({ id, component: 'default', title: id });
            }
            const group = dv.getGroupPanel(ids[0]).group;
            if (tabGroup.length > 0) {
                const tg = dv.api.createTabGroup({
                    groupId: group.id,
                    label: 'X',
                });
                for (const panelId of tabGroup) {
                    dv.api.addPanelToTabGroup({
                        groupId: group.id,
                        tabGroupId: tg.id,
                        panelId,
                    });
                }
            }
            return group.id;
        },
        { ids, tabGroup }
    );
    if (tabGroup.length > 0) {
        await expect(page.locator('.dv-tab-group-chip')).toHaveCount(1);
    }
    return groupId;
}

const tab = (page: Page, id: string) =>
    page.locator(`.dv-tab[data-tab-panel-id="${id}"]`).first();

async function box(page: Page, id: string) {
    return (await tab(page, id).boundingBox())!;
}

/** Panel ids in tab order for the group holding `id`. */
const order = (page: Page, id: string): Promise<string[]> =>
    page.evaluate(
        (id) =>
            (window as any).__dockview
                .getGroupPanel(id)
                .group.model.panels.map((p: any) => p.id),
        id
    );

/** The ids in `id`'s tab group, or null. */
const tabGroupOf = (page: Page, id: string): Promise<string[] | null> =>
    page.evaluate((id) => {
        const dv = (window as any).__dockview;
        const panel = dv.getGroupPanel(id);
        const tg = dv.api.getTabGroupForPanel({
            groupId: panel.group.id,
            panelId: id,
        });
        return tg ? [...tg.panelIds] : null;
    }, id);

/** Drag `from` by a point near its leading edge (a tab's title, clear of
 *  its close button) and release at (x, y). `vertical` for a strip that
 *  runs down the page. */
async function dragTo(
    page: Page,
    from: { x: number; y: number; width: number; height: number },
    x: number,
    y: number,
    vertical = false
): Promise<void> {
    const sx = vertical
        ? from.x + from.width / 2
        : from.x + Math.min(10, from.width / 2);
    const sy = vertical
        ? from.y + Math.min(10, from.height / 2)
        : from.y + from.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(vertical ? sx : sx + 6, vertical ? sy + 6 : sy, {
        steps: 3,
    });
    await page.mouse.move(x, y, { steps: 20 });
    await page.waitForTimeout(400);
    await page.mouse.move(vertical ? x : x + 1, vertical ? y + 1 : y);
    await page.mouse.up();
    await page.waitForTimeout(300);
}

/** Release just inside the leading edge of `id` (15px in, clear of the
 *  layout's edge-docking band when `id` is the first tab): the slot before
 *  it, in either animation (tabs are equal width). Drag from the right of `id`:
 *  the smooth animation collapses the dragged tab, which shifts the tabs
 *  after it. */
async function dropBefore(page: Page, source: string, id: string) {
    const target = await box(page, id);
    await dragTo(
        page,
        await box(page, source),
        target.x + 15,
        target.y + target.height / 2
    );
}

for (const mode of MODES) {
    test.describe(`tab strip ${label(mode)}`, () => {
        test('a tab dragged along the strip lands at the dropped slot', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3', 't4']);

            await dropBefore(page, 't4', 't2');

            expect(await order(page, 't1')).toEqual(['t1', 't4', 't2', 't3']);
        });

        test('a tab released at its own slot changes nothing', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3'], ['t1', 't2']);
            const t2 = await box(page, 't2');

            await dragTo(page, t2, t2.x + 10, t2.y + t2.height / 2);

            expect(await order(page, 't1')).toEqual(['t1', 't2', 't3']);
            expect(await tabGroupOf(page, 't2')).toEqual(['t1', 't2']);
        });

        test('a tab dropped between two tab group members joins at that slot', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3', 't4', 't5'], ['t2', 't3', 't4']);

            await dropBefore(page, 't5', 't3');

            expect(await tabGroupOf(page, 't5')).toEqual([
                't2',
                't5',
                't3',
                't4',
            ]);
        });

        test('a tab dropped right after a tab group lands outside it', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(
                page,
                ['t1', 't2', 't3', 't4', 't5', 't6'],
                ['t2', 't3', 't4']
            );

            await dropBefore(page, 't6', 't5');

            expect(await order(page, 't1')).toEqual([
                't1',
                't2',
                't3',
                't4',
                't6',
                't5',
            ]);
            expect(await tabGroupOf(page, 't6')).toBeNull();
        });

        test('a tab dropped on a chip lands before the tab group, outside it', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3', 't4'], ['t2', 't3']);
            const chip = (await page
                .locator('.dv-tab-group-chip')
                .boundingBox())!;

            await dragTo(
                page,
                await box(page, 't4'),
                chip.x + chip.width / 2,
                chip.y + chip.height / 2
            );

            expect(await order(page, 't1')).toEqual(['t1', 't4', 't2', 't3']);
            expect(await tabGroupOf(page, 't4')).toBeNull();
        });

        test('a dragged chip moves its tab group as one, never inside another', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3', 't4'], ['t1', 't2']);
            const chip = (await page
                .locator('.dv-tab-group-chip')
                .boundingBox())!;
            const last = await box(page, 't4');

            await dragTo(
                page,
                chip,
                last.x + last.width + 5,
                last.y + last.height / 2
            );

            expect(await order(page, 't1')).toEqual(['t3', 't4', 't1', 't2']);
            expect(await tabGroupOf(page, 't1')).toEqual(['t1', 't2']);
        });

        test('a tab from another group joins a tab group between its members', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3'], ['t1', 't2', 't3']);
            await page.evaluate(() =>
                (window as any).__dockview.addPanel({
                    id: 'u1',
                    component: 'default',
                    title: 'u1',
                    position: { direction: 'right' },
                })
            );

            await dropBefore(page, 'u1', 't2');

            expect(await tabGroupOf(page, 'u1')).toEqual([
                't1',
                'u1',
                't2',
                't3',
            ]);
        });

        test('a drop cancelled in onWillDrop changes nothing', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3', 't4'], ['t1', 't2', 't3']);
            await page.evaluate(() =>
                (window as any).__dockview.onWillDrop((e: any) =>
                    e.preventDefault()
                )
            );

            await dropBefore(page, 't4', 't2');

            expect(await order(page, 't1')).toEqual(['t1', 't2', 't3', 't4']);
            expect(await tabGroupOf(page, 't4')).toBeNull();
        });

        test('an unpinned tab cannot be dropped before the pinned tabs', async ({
            page,
        }) => {
            await open(page, mode);
            await setup(page, ['t1', 't2', 't3']);
            await page.evaluate(() =>
                (window as any).__dockview
                    .getGroupPanel('t1')
                    .api.setPinned(true)
            );

            await dropBefore(page, 't3', 't1');

            expect(await order(page, 't1')).toEqual(['t1', 't3', 't2']);
            expect(
                await page.evaluate(
                    () =>
                        (window as any).__dockview.getGroupPanel('t3').api
                            .isPinned
                )
            ).toBe(false);
        });
    });
}

test.describe('tab strip in a vertical header', () => {
    for (const dnd of ['pointer', 'html5'] as const) {
        test(`[${dnd}] a tab dragged down the strip lands at the dropped slot`, async ({
            page,
        }) => {
            await open(page, { dnd, smooth: false }, 'headerPosition=left');
            await setup(page, ['t1', 't2', 't3', 't4']);
            const target = await box(page, 't4');

            await dragTo(
                page,
                await box(page, 't1'),
                target.x + target.width / 2,
                target.y + 5,
                true
            );

            expect(await order(page, 't1')).toEqual(['t2', 't3', 't1', 't4']);
        });
    }
});

test.describe('tab strip placement through the API', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, { dnd: 'pointer', smooth: false });
        await setup(page, ['t1', 't2', 't3', 't4', 't5'], ['t2', 't3', 't4']);
    });

    test('moveTo places a tab in a tab group, or outside one', async ({
        page,
    }) => {
        const result = await page.evaluate(() => {
            const dv = (window as any).__dockview;
            const t5 = dv.getGroupPanel('t5');
            const tabGroup = dv.api.getTabGroupForPanel({
                groupId: t5.group.id,
                panelId: 't2',
            });
            const ats: unknown[] = [];
            dv.onDidMovePanel((e: any) =>
                ats.push(
                    e.at.tabGroup
                        ? { tabGroup: e.at.tabGroup.label, index: e.at.index }
                        : e.at
                )
            );
            t5.api.moveTo({ group: t5.group, at: { tabGroup, index: 1 } });
            const joined = [...tabGroup.panelIds];
            t5.api.moveTo({ group: t5.group, at: { index: 0 } });
            return { joined, left: [...tabGroup.panelIds], ats };
        });

        expect(result.joined).toEqual(['t2', 't5', 't3', 't4']);
        expect(result.left).toEqual(['t2', 't3', 't4']);
        expect(result.ats).toEqual([
            { tabGroup: 'X', index: 1 },
            { index: 0 },
        ]);
        expect(await order(page, 't1')).toEqual([
            't5',
            't1',
            't2',
            't3',
            't4',
        ]);
    });

    test('an index between two tab group members snaps to the nearer edge', async ({
        page,
    }) => {
        await page.evaluate(() => {
            const dv = (window as any).__dockview;
            const t1 = dv.getGroupPanel('t1');
            t1.api.moveTo({ group: t1.group, index: 2 });
        });

        expect(await order(page, 't1')).toEqual([
            't2',
            't3',
            't4',
            't1',
            't5',
        ]);
        expect(await tabGroupOf(page, 't1')).toBeNull();
    });

    test('getTabGroups lists tab groups in tab order on request', async ({
        page,
    }) => {
        const labels = await page.evaluate(() => {
            const dv = (window as any).__dockview;
            const groupId = dv.getGroupPanel('t1').group.id;
            const y = dv.api.createTabGroup({ groupId, label: 'Y' });
            dv.api.addPanelToTabGroup({
                groupId,
                tabGroupId: y.id,
                panelId: 't1',
            });
            const names = (order?: string) =>
                dv.api
                    .getTabGroups({ groupId, order })
                    .map((tg: any) => tg.label);
            return { creation: names(), tab: names('tab') };
        });

        expect(labels).toEqual({ creation: ['X', 'Y'], tab: ['Y', 'X'] });
    });
});

test.describe('pinned tabs', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, { dnd: 'pointer', smooth: false });
        await setup(page, ['t1', 't2', 't3', 't4'], ['t2', 't3']);
    });

    test('pinning moves a tab to the front and out of its tab group', async ({
        page,
    }) => {
        await page.evaluate(() =>
            (window as any).__dockview.getGroupPanel('t3').api.setPinned(true)
        );

        expect(await order(page, 't1')).toEqual(['t3', 't1', 't2', 't4']);
        expect(await tabGroupOf(page, 't3')).toBeNull();
        await expect(tab(page, 't3')).toHaveClass(/dv-tab--pinned/);
    });

    test('switching pinning off and on keeps the pin', async ({ page }) => {
        const states = await page.evaluate(() => {
            const dv = (window as any).__dockview;
            const t4 = dv.getGroupPanel('t4');
            t4.api.setPinned(true);
            const events: boolean[] = [];
            t4.api.onDidChangePinned((e: any) => events.push(e.isPinned));
            dv.updateOptions({ pinnedTabs: { enabled: false } });
            const off = t4.api.isPinned;
            dv.updateOptions({ pinnedTabs: { enabled: true } });
            return { off, on: t4.api.isPinned, events };
        });

        expect(states).toEqual({ off: false, on: true, events: [false, true] });
        expect(await order(page, 't1')).toEqual(['t4', 't1', 't2', 't3']);
        await expect(tab(page, 't4')).toHaveClass(/dv-tab--pinned/);
    });
});

test.describe('tab strip persistence', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, { dnd: 'pointer', smooth: false });
        await setup(page, ['t1', 't2', 't3', 't4'], ['t2', 't3']);
        await page.evaluate(() =>
            (window as any).__dockview.getGroupPanel('t4').api.setPinned(true)
        );
    });

    test('toJSON and fromJSON keep tab order, tab groups and pins', async ({
        page,
    }) => {
        await page.evaluate(() => {
            const dv = (window as any).__dockview;
            const saved = dv.toJSON();
            dv.clear();
            dv.fromJSON(saved);
        });

        expect(await order(page, 't1')).toEqual(['t4', 't1', 't2', 't3']);
        expect(await tabGroupOf(page, 't2')).toEqual(['t2', 't3']);
        await expect(tab(page, 't4')).toHaveClass(/dv-tab--pinned/);
    });

    test('addGroupFromJSON keeps tab order, tab groups and pins', async ({
        page,
    }) => {
        await page.evaluate(() => {
            const dv = (window as any).__dockview;
            const group = dv.getGroupPanel('t1').group;
            const state = dv.api.serializeGroup(group);
            dv.removeGroup(group);
            dv.addGroupFromJSON(state);
        });

        expect(await order(page, 't1')).toEqual(['t4', 't1', 't2', 't3']);
        expect(await tabGroupOf(page, 't2')).toEqual(['t2', 't3']);
        await expect(tab(page, 't4')).toHaveClass(/dv-tab--pinned/);
    });
});
