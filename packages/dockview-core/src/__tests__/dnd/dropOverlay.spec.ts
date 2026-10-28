import { renderInPlaceOverlay } from '../../dnd/dropOverlay';

describe('dropOverlay', () => {
    describe('renderInPlaceOverlay with a pixel size', () => {
        function render(
            quadrant: 'left' | 'right' | 'top' | 'bottom',
            value: number
        ): HTMLElement {
            const overlay = document.createElement('div');
            renderInPlaceOverlay(overlay, quadrant, 200, 400, {
                size: { type: 'pixels', value },
            });
            return overlay;
        }

        test('a pixel size within the element is proportional', () => {
            expect(render('left', 50).style.width).toBe('25%');
            expect(render('right', 50).style.width).toBe('25%');
            expect(render('top', 100).style.height).toBe('25%');
            expect(render('bottom', 100).style.height).toBe('25%');
        });

        test('a pixel size larger than the element is clamped to the full size', () => {
            expect(render('left', 500).style.width).toBe('100%');
            expect(render('right', 500).style.width).toBe('100%');
            expect(render('top', 900).style.height).toBe('100%');
            expect(render('bottom', 900).style.height).toBe('100%');
        });

        test('a negative pixel size is clamped to zero', () => {
            expect(render('left', -10).style.width).toBe('0%');
            expect(render('top', -10).style.height).toBe('0%');
        });
    });
});
