import { test, expect, Page } from '@playwright/test';

/**
 * jsdom has no layout and no `Element.animate`, so whether the collapse
 * visibly animates, and how an interrupted one behaves, needs a real browser.
 * The fixture exposes `__dv.sample(panelId, ms)`: the tab's main-axis size
 * on every frame.
 */

type Sample = { t: number; size: number; animations: string[] };

const dv = (page: Page) => ({
    collapse: () => page.evaluate(() => (window as any).__dv.collapse()),
    expand: () => page.evaluate(() => (window as any).__dv.expand()),
    size: (id: string) =>
        page.evaluate((id) => (window as any).__dv.size(id), id),
    classes: (id: string): Promise<string[]> =>
        page.evaluate((id) => (window as any).__dv.classes(id), id),
    inlineTransition: (id: string): Promise<string> =>
        page.evaluate((id) => (window as any).__dv.inlineTransition(id), id),
    inlineSize: (id: string): Promise<{ width: string; height: string }> =>
        page.evaluate((id) => (window as any).__dv.inlineSize(id), id),
    sample: (id: string, ms: number): Promise<Sample[]> =>
        page.evaluate(
            ([id, ms]) => (window as any).__dv.sample(id, ms),
            [id, ms] as const
        ),
});

const open = async (
    page: Page,
    query: { duration?: string; header?: string } = {}
) => {
    const params = new URLSearchParams(query as Record<string, string>);
    await page.goto(`/e2e/fixtures/tab-group-collapse.html?${params}`);
    await page.waitForFunction(() => (window as any).__ready === true);
};

// Frames strictly between the start and end sizes.
const intermediate = (samples: Sample[], full: number) =>
    samples.filter((s) => s.size > 1 && s.size < full - 1);

test.describe('animated tab-group collapse', () => {
    test('geometry shrinks over the theme duration instead of snapping to zero', async ({
        page,
    }) => {
        await open(page, { duration: '600ms' });
        const full = await dv(page).size('orders');
        expect(full).toBeGreaterThan(20);

        const samplesPromise = dv(page).sample('orders', 900);
        await dv(page).collapse();
        const samples = await samplesPromise;

        expect(intermediate(samples, full).length).toBeGreaterThan(5);
        for (let i = 1; i < samples.length; i++) {
            expect(samples[i].size).toBeLessThanOrEqual(
                samples[i - 1].size + 0.5
            );
        }
        const mid = samples.find((s) => s.t >= 250 && s.t <= 350);
        expect(mid?.size).toBeGreaterThan(full * 0.1);
        expect(samples[samples.length - 1].size).toBe(0);
        // The class swap at the end must not start a CSS transition.
        expect(samples.flatMap((s) => s.animations)).not.toContain(
            'CSSTransition'
        );
        expect(samples[samples.length - 1].animations).toEqual([]);

        const classes = await dv(page).classes('orders');
        expect(classes).toContain('dv-tab--group-collapsed');
        expect(classes).not.toContain('dv-tab--group-collapsing');
        expect(await dv(page).inlineTransition('orders')).toBe('');
        expect(await dv(page).inlineSize('orders')).toEqual({
            width: '',
            height: '',
        });
    });

    test('with no theme duration set (every shipped theme) the collapse animates over the 200ms default', async ({
        page,
    }) => {
        await open(page);
        expect(
            await page.evaluate(() =>
                getComputedStyle(
                    document.getElementById('app')!
                ).getPropertyValue('--dv-transition-duration')
            )
        ).toBe('');
        const full = await dv(page).size('orders');

        const samplesPromise = dv(page).sample('orders', 500);
        await dv(page).collapse();
        const samples = await samplesPromise;

        expect(intermediate(samples, full).length).toBeGreaterThan(3);
        const settled = samples.find((s) => s.size === 0);
        expect(settled?.t).toBeGreaterThan(100);
        expect(settled?.t).toBeLessThan(400);
        expect(samples[samples.length - 1].size).toBe(0);
    });

    test('collapsing mid-expand starts from the tab\'s current size, not full size', async ({
        page,
    }) => {
        await open(page, { duration: '600ms' });
        const full = await dv(page).size('orders');
        await dv(page).collapse();
        await page.waitForTimeout(800);
        expect(await dv(page).size('orders')).toBe(0);

        await dv(page).expand();
        await page.waitForTimeout(200);
        const atInterrupt = await dv(page).size('orders');
        expect(atInterrupt).toBeGreaterThan(2);
        expect(atInterrupt).toBeLessThan(full * 0.9);

        const samplesPromise = dv(page).sample('orders', 300);
        await dv(page).collapse();
        const samples = await samplesPromise;

        // Dropping the expand transition snaps the layout to full size underneath.
        for (const s of samples.slice(0, 4)) {
            expect(s.size).toBeLessThan(full * 0.9);
        }
        expect(samples[samples.length - 1].size).toBeLessThan(atInterrupt);
    });

    test('every tab in the group animates and settles', async ({ page }) => {
        await open(page, { duration: '300ms' });
        await dv(page).collapse();
        await page.waitForTimeout(500);
        for (const id of ['orders', 'positions', 'history']) {
            expect(await dv(page).size(id)).toBe(0);
            expect(await dv(page).classes(id)).toContain(
                'dv-tab--group-collapsed'
            );
        }
        expect(await dv(page).size('home')).toBeGreaterThan(20);
        expect(await dv(page).size('notes')).toBeGreaterThan(20);
    });

    test('expanding mid-collapse reverses smoothly from the current size', async ({
        page,
    }) => {
        await open(page, { duration: '600ms' });
        const full = await dv(page).size('orders');

        await dv(page).collapse();
        await page.waitForTimeout(300);
        const atInterrupt = await dv(page).size('orders');
        expect(atInterrupt).toBeGreaterThan(full * 0.1);
        expect(atInterrupt).toBeLessThan(full * 0.9);

        const samplesPromise = dv(page).sample('orders', 700);
        await dv(page).expand();
        const samples = await samplesPromise;

        // The sampler may catch a frame of the collapse before the expand lands.
        const turnaround = samples.reduce(
            (min, s, i) => (s.size < samples[min].size ? i : min),
            0
        );
        expect(samples[turnaround].size).toBeGreaterThan(atInterrupt * 0.5);
        expect(turnaround).toBeLessThan(4);
        for (let i = turnaround + 1; i < samples.length; i++) {
            expect(samples[i].size).toBeGreaterThanOrEqual(
                samples[i - 1].size - 0.5
            );
        }
        expect(samples[samples.length - 1].size).toBeCloseTo(full, 0);

        const classes = await dv(page).classes('orders');
        expect(classes).not.toContain('dv-tab--group-collapsed');
        expect(classes).not.toContain('dv-tab--group-collapsing');
        expect(classes).not.toContain('dv-tab--group-expanding');
        expect(await dv(page).inlineTransition('orders')).toBe('');
    });

    test('rapid collapse / expand / collapse settles collapsed with one animation', async ({
        page,
    }) => {
        await open(page, { duration: '400ms' });
        await dv(page).collapse();
        await page.waitForTimeout(120);
        await dv(page).expand();
        await page.waitForTimeout(80);
        await dv(page).collapse();
        await page.waitForTimeout(700);

        for (const id of ['orders', 'positions', 'history']) {
            expect(await dv(page).size(id)).toBe(0);
            const classes = await dv(page).classes(id);
            expect(classes).toContain('dv-tab--group-collapsed');
            expect(classes).not.toContain('dv-tab--group-collapsing');
            expect(await dv(page).inlineTransition(id)).toBe('');
        }
        const live = await page.evaluate(() =>
            (window as any).__dv
                .tabEl('orders')
                .getAnimations()
                .length
        );
        expect(live).toBe(0);
    });

    test('the expand transition runs for the full themed duration', async ({
        page,
    }) => {
        await open(page, { duration: '800ms' });
        const full = await dv(page).size('orders');
        await dv(page).collapse();
        await page.waitForTimeout(1000);
        expect(await dv(page).size('orders')).toBe(0);

        await dv(page).expand();
        // A fixed 300ms fallback would have cut this off.
        await page.waitForTimeout(450);
        expect(await dv(page).classes('orders')).toContain(
            'dv-tab--group-expanding'
        );
        const partWay = await dv(page).size('orders');
        expect(partWay).toBeGreaterThan(0);
        expect(partWay).toBeLessThan(full - 1);

        await page.waitForTimeout(600);
        expect(await dv(page).classes('orders')).not.toContain(
            'dv-tab--group-expanding'
        );
        expect(await dv(page).size('orders')).toBeCloseTo(full, 0);
    });

    test('a vertical header animates height', async ({ page }) => {
        await open(page, { duration: '600ms', header: 'left' });
        const full = await dv(page).size('orders');
        expect(full).toBeGreaterThan(10);

        const samplesPromise = dv(page).sample('orders', 900);
        await dv(page).collapse();
        const samples = await samplesPromise;

        expect(intermediate(samples, full).length).toBeGreaterThan(5);
        expect(samples[samples.length - 1].size).toBe(0);
        expect(await dv(page).classes('orders')).toContain(
            'dv-tab--group-collapsed'
        );
        expect(await dv(page).inlineSize('orders')).toEqual({
            width: '',
            height: '',
        });
    });

    test('an invalid negative theme duration still collapses the whole group', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await open(page, { duration: '-200ms' });

        await dv(page).collapse();
        await page.waitForTimeout(500);

        expect(errors).toEqual([]);
        for (const id of ['orders', 'positions', 'history']) {
            expect(await dv(page).size(id)).toBe(0);
        }
    });

    test('reduced motion collapses instantly', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await open(page, { duration: '600ms' });

        await dv(page).collapse();
        expect(await dv(page).size('orders')).toBe(0);
        expect(await dv(page).classes('orders')).toContain(
            'dv-tab--group-collapsed'
        );
        expect(await dv(page).inlineTransition('orders')).toBe('');
    });
});
