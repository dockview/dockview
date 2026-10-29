import {
    nearestEdgeResolver,
    Position,
    resolveNearestEdge,
} from '../../dnd/droptarget';

const ALL = new Set<Position>(['top', 'bottom', 'left', 'right', 'center']);

function resolve(
    x: number,
    y: number,
    zones: ReadonlySet<Position> = ALL,
    width = 1000,
    height = 100
) {
    return nearestEdgeResolver.resolve({
        x,
        y,
        width,
        height,
        zones,
        event: new Event('dragover') as DragEvent,
    })?.position;
}

describe('nearestEdgeResolver', () => {
    test('resolves every point of a wide, short target to a side', () => {
        expect(resolve(500, 80)).toBe('bottom');
        expect(resolve(500, 20)).toBe('top');
        expect(resolve(500, 49)).toBe('top');
        expect(resolve(20, 50)).toBe('left');
        expect(resolve(980, 50)).toBe('right');
    });

    test('measures the sides in proportion to the target', () => {
        // 100px of 1000px wide is 10%; 30px of 100px high is 30%.
        expect(resolve(100, 70)).toBe('left');
        expect(resolve(200, 85)).toBe('bottom');
    });

    test('falls back to the nearer side across when a side is not accepted', () => {
        const noLeft = new Set<Position>(['top', 'bottom', 'right']);
        expect(resolve(20, 80, noLeft)).toBe('bottom');
        expect(resolve(20, 50, new Set<Position>(['center']))).toBeUndefined();
    });

    test('keeps the previous side within the hysteresis', () => {
        const args = (x: number, y: number) => ({
            x,
            y,
            width: 100,
            height: 100,
            zones: ALL,
            event: new Event('dragover') as DragEvent,
        });
        // Top is nearer by 5%, within the 12% hysteresis: left is kept.
        expect(resolveNearestEdge(args(30, 25), 'left', 0.12)?.position).toBe(
            'left'
        );
        // Nearer by 15%: top wins.
        expect(resolveNearestEdge(args(30, 15), 'left', 0.12)?.position).toBe(
            'top'
        );
        expect(resolveNearestEdge(args(30, 25))?.position).toBe('top');
    });
});
