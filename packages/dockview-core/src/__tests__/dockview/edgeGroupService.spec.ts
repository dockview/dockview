import { EdgeGroupService } from '../../dockview/edgeGroupService';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';

/** The registry only ever compares groups by identity. */
function group(id: string): DockviewGroupPanel {
    return { id } as DockviewGroupPanel;
}

function disposable(): { dispose: jest.Mock } {
    return { dispose: jest.fn() };
}

describe('EdgeGroupService', () => {
    let service: EdgeGroupService;

    beforeEach(() => {
        service = new EdgeGroupService();
    });

    afterEach(() => {
        service.dispose();
    });

    test('an edge holds its groups in insertion order', () => {
        const a = group('a');
        const b = group('b');
        service.add('left', a, disposable());
        service.add('left', b, disposable());

        expect(service.getAll('left')).toEqual([a, b]);
        expect(service.get('left')).toBe(a);
        expect(service.has('left')).toBe(true);
        expect(service.has('right')).toBe(false);
        expect(service.getAll('right')).toEqual([]);
    });

    test('add at an index inserts before the member at that index', () => {
        const a = group('a');
        const b = group('b');
        const c = group('c');
        service.add('left', a, disposable());
        service.add('left', b, disposable());
        service.add('left', c, disposable(), 1);

        expect(service.getAll('left')).toEqual([a, c, b]);
        expect(service.indexOf(c)).toBe(1);
        expect(service.indexOf(group('x'))).toBe(-1);
    });

    test('move reorders within the edge', () => {
        const a = group('a');
        const b = group('b');
        const c = group('c');
        service.add('left', a, disposable());
        service.add('left', b, disposable());
        service.add('left', c, disposable());

        service.move(c, 0);
        expect(service.getAll('left')).toEqual([c, a, b]);

        service.move(c, 2);
        expect(service.getAll('left')).toEqual([a, b, c]);
    });

    test('remove(group) disposes only that group and keeps its siblings', () => {
        const a = group('a');
        const b = group('b');
        const da = disposable();
        const db = disposable();
        service.add('left', a, da);
        service.add('left', b, db);

        service.remove(a);

        expect(da.dispose).toHaveBeenCalledTimes(1);
        expect(db.dispose).not.toHaveBeenCalled();
        expect(service.getAll('left')).toEqual([b]);
        expect(service.includes(a)).toBe(false);
        expect(service.includes(b)).toBe(true);
    });

    test('removing the last member empties the edge', () => {
        const a = group('a');
        service.add('bottom', a, disposable());

        service.remove(a);

        expect(service.has('bottom')).toBe(false);
        expect(service.hasAny()).toBe(false);
        expect(service.get('bottom')).toBeUndefined();
    });

    test('removing an unknown group is a no-op', () => {
        const a = group('a');
        service.add('top', a, disposable());

        expect(() => service.remove(group('x'))).not.toThrow();
        expect(service.getAll('top')).toEqual([a]);
    });

    test('entries() flattens every edge in stack order', () => {
        const l1 = group('l1');
        const l2 = group('l2');
        const r1 = group('r1');
        service.add('left', l1, disposable());
        service.add('right', r1, disposable());
        service.add('left', l2, disposable());

        expect([...service.entries()]).toEqual([
            ['left', l1],
            ['left', l2],
            ['right', r1],
        ]);
    });

    test('findPositionOf resolves any member of a stack', () => {
        const a = group('a');
        const b = group('b');
        service.add('right', a, disposable());
        service.add('right', b, disposable());

        expect(service.findPositionOf(a)).toBe('right');
        expect(service.findPositionOf(b)).toBe('right');
        expect(service.findPositionOf(group('x'))).toBeUndefined();
    });

    test('per-group flags are independent of stack bookkeeping', () => {
        const a = group('a');
        const b = group('b');
        service.add('left', a, disposable());
        service.add('left', b, disposable());

        service.setAutoHide(a, true);
        service.setAutoReveal(b, true);

        expect(service.isAutoHide(a)).toBe(true);
        expect(service.isAutoHide(b)).toBeUndefined();
        expect(service.isAutoReveal(a)).toBe(false);
        expect(service.isAutoReveal(b)).toBe(true);

        service.setAutoHide(a, undefined);
        expect(service.isAutoHide(a)).toBeUndefined();
    });

    test('disposeAll disposes every member and clears the registry', () => {
        const da = disposable();
        const db = disposable();
        service.add('left', group('a'), da);
        service.add('top', group('b'), db);

        service.disposeAll();

        expect(da.dispose).toHaveBeenCalledTimes(1);
        expect(db.dispose).toHaveBeenCalledTimes(1);
        expect(service.hasAny()).toBe(false);
    });
});
