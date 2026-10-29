import { LayoutTransition } from '../../dockview/layoutTransition';

type Box = { left: number; top: number; width: number; height: number };

function mockBox(element: HTMLElement, box: () => Box): void {
    jest.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
        const { left, top, width, height } = box();
        return {
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
            x: left,
            y: top,
            toJSON: () => ({}),
        };
    });
}

function createLayout(box: () => Box) {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.className = 'dv-view-container';
    const container = document.createElement('div');
    container.className = 'dv-view';
    const group = document.createElement('div');
    container.append(group);
    parent.append(container);
    root.append(parent);

    mockBox(parent, () => ({ left: 100, top: 50, width: 1000, height: 600 }));
    mockBox(container, box);

    const animations: { keyframes: Keyframe[]; cancel: jest.Mock }[] = [];
    container.animate = jest.fn((keyframes: Keyframe[]) => {
        const animation = { keyframes, cancel: jest.fn() };
        animations.push(animation);
        return animation as unknown as Animation;
    }) as unknown as HTMLElement['animate'];

    return { root, container, animations };
}

describe('LayoutTransition', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('animates a view from its old box to its new one', () => {
        let box: Box = { left: 100, top: 50, width: 1000, height: 600 };
        const { root, animations } = createLayout(() => box);
        const frames = jest.fn();
        const transition = new LayoutTransition(() => root, frames, 200);

        transition.run(() => {
            box = { left: 600, top: 50, width: 500, height: 600 };
        });

        expect(animations).toHaveLength(1);
        expect(animations[0].keyframes).toEqual([
            { left: '0px', top: '0px', width: '1000px', height: '600px' },
            { left: '500px', top: '0px', width: '500px', height: '600px' },
        ]);

        jest.advanceTimersByTime(200);

        expect(animations[0].cancel).toHaveBeenCalled();
        expect(frames).toHaveBeenCalled();
    });

    test('leaves views that did not move alone', () => {
        const { root, animations } = createLayout(() => ({
            left: 100,
            top: 50,
            width: 1000,
            height: 600,
        }));
        const transition = new LayoutTransition(() => root, jest.fn(), 200);

        transition.run(() => undefined);

        expect(animations).toHaveLength(0);
    });

    test('a new change ends the one in flight and carries on from where the views are', () => {
        let box: Box = { left: 100, top: 50, width: 1000, height: 600 };
        const { root, animations } = createLayout(() => box);
        const transition = new LayoutTransition(() => root, jest.fn(), 200);

        transition.run(() => {
            box = { left: 100, top: 50, width: 500, height: 600 };
        });
        box = { left: 100, top: 50, width: 750, height: 600 };

        transition.run(() => {
            box = { left: 100, top: 50, width: 1000, height: 600 };
        });

        expect(animations[0].cancel).toHaveBeenCalled();
        expect(animations[1].keyframes[0]).toMatchObject({ width: '750px' });
        expect(animations[1].keyframes[1]).toMatchObject({ width: '1000px' });
    });

    test('finishing settles overlays once more, a couple of frames later', () => {
        let box: Box = { left: 100, top: 50, width: 1000, height: 600 };
        const { root } = createLayout(() => box);
        const frames = jest.fn();
        const transition = new LayoutTransition(() => root, frames, 200);

        transition.run(() => {
            box = { left: 100, top: 50, width: 500, height: 600 };
        });
        transition.finish();
        const calls = frames.mock.calls.length;

        jest.advanceTimersByTime(100);

        expect(frames.mock.calls.length).toBeGreaterThan(calls);
    });
});
