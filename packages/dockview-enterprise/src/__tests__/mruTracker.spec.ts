import { MruTracker } from '../mruTracker';
import { AdvancedOverflowService } from '../advancedOverflowService';

describe('MruTracker', () => {
    test('seeds from tab order on attach', () => {
        const mru = new MruTracker();
        mru.attach('g', ['a', 'b', 'c']);
        expect(mru.order('g')).toEqual(['a', 'b', 'c']);
    });

    test('activate moves a panel to the front (most recent first)', () => {
        const mru = new MruTracker();
        mru.attach('g', ['a', 'b', 'c']);

        mru.activate('g', 'c');
        expect(mru.order('g')).toEqual(['c', 'a', 'b']);

        mru.activate('g', 'a');
        expect(mru.order('g')).toEqual(['a', 'c', 'b']);

        // Re-activating the already-front panel is a no-op on order.
        mru.activate('g', 'a');
        expect(mru.order('g')).toEqual(['a', 'c', 'b']);
    });

    test('never-activated panels keep their seeded (tab) order behind activated ones', () => {
        const mru = new MruTracker();
        mru.attach('g', ['a', 'b', 'c', 'd']);
        mru.activate('g', 'c');
        // c is front; a, b, d keep their original relative order.
        expect(mru.order('g')).toEqual(['c', 'a', 'b', 'd']);
    });

    test('activating an untracked panel adds it to the front', () => {
        const mru = new MruTracker();
        mru.attach('g', ['a', 'b']);
        mru.activate('g', 'z');
        expect(mru.order('g')).toEqual(['z', 'a', 'b']);
    });

    test('a cross-group activation leaves the source list and enters the destination', () => {
        const mru = new MruTracker();
        mru.attach('g1', ['a', 'b']);
        mru.attach('g2', ['c', 'd']);

        mru.activate('g2', 'a');

        expect(mru.order('g1')).toEqual(['b']);
        expect(mru.order('g2')).toEqual(['a', 'c', 'd']);
    });

    test('remove prunes a panel from every group list', () => {
        const mru = new MruTracker();
        mru.attach('g1', ['a', 'b']);
        mru.attach('g2', ['a', 'c']); // same id present in two lists (defensive)

        mru.remove('a');

        expect(mru.order('g1')).toEqual(['b']);
        expect(mru.order('g2')).toEqual(['c']);
    });

    test('detach drops a group entirely', () => {
        const mru = new MruTracker();
        mru.attach('g', ['a']);
        expect(mru.has('g')).toBe(true);
        mru.detach('g');
        expect(mru.has('g')).toBe(false);
        expect(mru.order('g')).toEqual([]);
    });

    test('re-attach preserves existing recency and appends new ids at the back', () => {
        const mru = new MruTracker();
        mru.attach('g', ['a', 'b', 'c']);
        mru.activate('g', 'c'); // -> [c, a, b]
        mru.attach('g', ['a', 'b', 'c', 'd']);
        expect(mru.order('g')).toEqual(['c', 'a', 'b', 'd']);
    });
});

/**
 * The `origin` filter lives in the service (it reads the event payload), so it
 * is exercised through `AdvancedOverflowService.handleActivePanelChange`.
 */
describe('AdvancedOverflowService: MRU origin filter', () => {
    const makeGroup = (id: string, panelIds: string[]): any => ({
        id,
        panels: panelIds.map((pid) => ({ id: pid })),
        model: {
            onDidRemovePanel: () => ({ dispose: () => undefined }),
        },
    });

    const activation = (panelId: string, groupId: string, origin: string) => ({
        origin,
        panel: { id: panelId, group: { id: groupId } },
    });

    test("a user activation reorders recency; an 'api' activation does not", () => {
        const service = new AdvancedOverflowService({} as any);
        service.attachToGroup(makeGroup('g', ['a', 'b', 'c']));

        // Programmatic (origin 'api'); must not reorder.
        service.handleActivePanelChange(activation('c', 'g', 'api') as any);
        expect(service.mru.order('g')).toEqual(['a', 'b', 'c']);

        // User gesture, reorders.
        service.handleActivePanelChange(activation('c', 'g', 'user') as any);
        expect(service.mru.order('g')).toEqual(['c', 'a', 'b']);

        service.dispose();
    });

    test('an activation with no panel (all tabs closed) is ignored', () => {
        const service = new AdvancedOverflowService({} as any);
        service.attachToGroup(makeGroup('g', ['a', 'b']));

        service.handleActivePanelChange({
            origin: 'user',
            panel: undefined,
        } as any);
        expect(service.mru.order('g')).toEqual(['a', 'b']);

        service.dispose();
    });
});
