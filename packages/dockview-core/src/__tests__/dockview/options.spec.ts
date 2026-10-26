import { resolveDndCapabilities } from '../../dockview/dndCapabilities';
import {
    DockviewComponent,
    DockviewComponentOptions,
} from '../../dockview/dockviewComponent';
import { PROPERTY_KEYS_DOCKVIEW } from '../../dockview/options';
import { IContentRenderer } from '../../dockview/types';

function mockMatchMedia(byQuery: Record<string, boolean>): () => void {
    const original = window.matchMedia;
    (window as any).matchMedia = (query: string) =>
        ({
            matches: byQuery[query] ?? false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
            onchange: null,
        }) as MediaQueryList;
    return () => {
        (window as any).matchMedia = original;
    };
}

describe('resolveDndCapabilities', () => {
    test("'auto' (default): both backends active, pointer is touch-only on hybrid/desktop", () => {
        // jsdom has no matchMedia → falls back to the non-coarse branch.
        expect(resolveDndCapabilities({ dndStrategy: 'auto' })).toEqual({
            html5: true,
            pointer: true,
            pointerHandlesMouse: false,
        });
    });

    test("'auto' on a touch-primary device resolves to pointer-only", () => {
        const restore = mockMatchMedia({
            '(pointer: coarse)': true,
            '(pointer: fine)': false,
        });
        try {
            expect(resolveDndCapabilities({ dndStrategy: 'auto' })).toEqual({
                html5: false,
                pointer: true,
                pointerHandlesMouse: true,
            });
        } finally {
            restore();
        }
    });

    test("'auto' on a hybrid device (coarse + fine) keeps both backends", () => {
        // Touchscreen laptop / iPad with mouse: HTML5 stays available so the
        // real mouse path keeps working.
        const restore = mockMatchMedia({
            '(pointer: coarse)': true,
            '(pointer: fine)': true,
        });
        try {
            expect(resolveDndCapabilities({ dndStrategy: 'auto' })).toEqual({
                html5: true,
                pointer: true,
                pointerHandlesMouse: false,
            });
        } finally {
            restore();
        }
    });

    test('undefined strategy resolves the same as auto', () => {
        expect(resolveDndCapabilities({})).toEqual(
            resolveDndCapabilities({ dndStrategy: 'auto' })
        );
    });

    test("'pointer': pointer handles every input type; HTML5 off", () => {
        expect(resolveDndCapabilities({ dndStrategy: 'pointer' })).toEqual({
            html5: false,
            pointer: true,
            pointerHandlesMouse: true,
        });
    });

    test("'html5': HTML5 only; pointer off", () => {
        expect(resolveDndCapabilities({ dndStrategy: 'html5' })).toEqual({
            html5: true,
            pointer: false,
            pointerHandlesMouse: false,
        });
    });

    test('disableDnd overrides every strategy', () => {
        const expected = {
            html5: false,
            pointer: false,
            pointerHandlesMouse: false,
        };
        expect(
            resolveDndCapabilities({ disableDnd: true, dndStrategy: 'auto' })
        ).toEqual(expected);
        expect(
            resolveDndCapabilities({ disableDnd: true, dndStrategy: 'pointer' })
        ).toEqual(expected);
        expect(
            resolveDndCapabilities({ disableDnd: true, dndStrategy: 'html5' })
        ).toEqual(expected);
    });

    test('pointerHandlesMouse never true without pointer being true', () => {
        // Property-style invariant check across every shape.
        for (const dndStrategy of [
            'auto',
            'pointer',
            'html5',
            undefined,
        ] as const) {
            for (const disableDnd of [false, true]) {
                const caps = resolveDndCapabilities({
                    dndStrategy,
                    disableDnd,
                });
                if (caps.pointerHandlesMouse) {
                    expect(caps.pointer).toBe(true);
                }
            }
        }
    });
});

/**
 * `'auto'` resolves against the device, and the choice is load-bearing: only an
 * HTML5 drag can leave the window it started in, and an embedded webview
 * reporting a coarse pointer is where that bites.
 */
describe('api.dndCapabilities', () => {
    class TestPanel implements IContentRenderer {
        element = document.createElement('div');
        init(): void {
            // noop
        }
    }

    function componentWith(options: Partial<DockviewComponentOptions>) {
        const component = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            ...options,
        } as DockviewComponentOptions);
        component.layout(500, 500);
        return component;
    }

    test('reports the resolved strategy, not the configured one', () => {
        const component = componentWith({ dndStrategy: 'auto' });
        try {
            // jsdom has no matchMedia, so 'auto' resolves to the desktop shape
            expect(component.api.dndCapabilities).toEqual({
                html5: true,
                pointer: true,
                pointerHandlesMouse: false,
            });
        } finally {
            component.dispose();
        }
    });

    test('follows updateOptions', () => {
        const component = componentWith({ dndStrategy: 'auto' });
        try {
            component.updateOptions({ dndStrategy: 'pointer' });

            expect(component.api.dndCapabilities).toEqual({
                html5: false,
                pointer: true,
                pointerHandlesMouse: true,
            });
        } finally {
            component.dispose();
        }
    });

    test('reports both backends off when dnd is disabled', () => {
        const component = componentWith({ disableDnd: true });
        try {
            expect(component.api.dndCapabilities).toEqual({
                html5: false,
                pointer: false,
                pointerHandlesMouse: false,
            });
        } finally {
            component.dispose();
        }
    });
});

describe('PROPERTY_KEYS_DOCKVIEW', () => {
    test('includes nonce so framework wrappers (React, Vue) auto-forward it', () => {
        expect(PROPERTY_KEYS_DOCKVIEW).toContain('nonce');
    });
});
