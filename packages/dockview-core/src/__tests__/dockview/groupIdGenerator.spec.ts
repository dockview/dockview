import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { IContentRenderer } from '../../dockview/types';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

function createDockview(groupIdGenerator?: () => string): DockviewComponent {
    const dockview = new DockviewComponent(document.createElement('div'), {
        createComponent: () => new TestPanel(),
        ...(groupIdGenerator ? { groupIdGenerator } : {}),
    });
    dockview.layout(1000, 600);
    return dockview;
}

/** A generator that hands out the given ids in order. */
function scripted(...ids: string[]): jest.Mock<string, []> {
    const queue = [...ids];
    return jest.fn(() => {
        const next = queue.shift();
        if (next === undefined) {
            throw new Error('scripted generator exhausted');
        }
        return next;
    });
}

/**
 * `groupIdGenerator` replaces the sequential counter for every group dockview
 * creates without an explicit id, so an application can give groups ids that
 * stay unique across instances.
 */
describe('groupIdGenerator', () => {
    let dockview: DockviewComponent;

    afterEach(() => {
        dockview.dispose();
    });

    test('defaults to the sequential counter', () => {
        dockview = createDockview();
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { referencePanel: p1, direction: 'right' },
        });

        expect([p1.group.id, p2.group.id]).toEqual(['1', '2']);
    });

    test('the default counter skips past any number of live ids', () => {
        dockview = createDockview();
        for (let i = 1; i <= 150; i++) {
            dockview.addGroup({ id: String(i), direction: 'right' });
        }

        const group = dockview.addGroup({ direction: 'right' });

        expect(group.id).toBe('151');
    });

    test('names the groups created by addPanel, addGroup and a split', () => {
        const generator = scripted('alpha', 'beta', 'gamma');
        dockview = createDockview(generator);

        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const group = dockview.addGroup({ direction: 'right' });
        const p3 = dockview.addPanel({
            id: 'p3',
            component: 'default',
            position: { referencePanel: p1, direction: 'below' },
        });

        expect(p1.group.id).toBe('alpha');
        expect(group.id).toBe('beta');
        expect(p3.group.id).toBe('gamma');
        expect(generator).toHaveBeenCalledTimes(3);
    });

    test('is not consulted for an explicit group id', () => {
        const generator = scripted('alpha');
        dockview = createDockview(generator);

        const group = dockview.addGroup({ id: 'chosen', direction: 'right' });

        expect(group.id).toBe('chosen');
        expect(generator).not.toHaveBeenCalled();
    });

    test('skips an id that is already in use', () => {
        const generator = scripted('alpha', 'alpha', 'beta');
        dockview = createDockview(generator);

        const first = dockview.addGroup({ direction: 'right' });
        const second = dockview.addGroup({ direction: 'right' });

        expect([first.id, second.id]).toEqual(['alpha', 'beta']);
        expect(generator).toHaveBeenCalledTimes(3);
    });

    test('is used for the reassigned id when an explicit one collides', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
            // silence
        });
        dockview = createDockview(scripted('alpha', 'beta'));
        dockview.addGroup({ id: 'taken', direction: 'right' });

        const group = dockview.addGroup({ id: 'taken', direction: 'right' });

        expect(group.id).toBe('alpha');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    test('throws when the generator keeps returning live ids', () => {
        dockview = createDockview(() => 'stuck');
        dockview.addGroup({ direction: 'right' });

        expect(() => dockview.addGroup({ direction: 'right' })).toThrow(
            'dockview: groupIdGenerator returned an id already in use 100 times in a row'
        );
    });

    test('throws when the generator returns something other than an id', () => {
        dockview = createDockview(() => '' as string);

        expect(() => dockview.addGroup({ direction: 'right' })).toThrow(
            'dockview: groupIdGenerator must return a non-empty string'
        );
    });

    test('can be switched on and off through updateOptions', () => {
        dockview = createDockview();
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        expect(p1.group.id).toBe('1');

        dockview.updateOptions({ groupIdGenerator: scripted('alpha') });
        const alpha = dockview.addGroup({ direction: 'right' });
        expect(alpha.id).toBe('alpha');

        dockview.updateOptions({ groupIdGenerator: undefined });
        const next = dockview.addGroup({ direction: 'right' });
        expect(next.id).toBe('2');
    });

    test('keeps a group id when it moves between two instances', () => {
        const randomId = () => crypto.randomUUID();
        dockview = createDockview(randomId);
        const target = createDockview(randomId);

        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        const envelope = dockview.serializeGroup(panel.group);
        target.addPanel({ id: 'local', component: 'default' });

        const moved = target.addGroupFromJSON(envelope, { direction: 'right' });

        expect(moved.id).toBe(panel.group.id);
        expect(target.groups.map((g) => g.id)).not.toContain('1');
        target.dispose();
    });
});
