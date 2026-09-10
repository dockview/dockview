import { fromPartial } from '@total-typescript/shoehorn';

/**
 * A mock window whose `load` event is held back until the returned `load()` is
 * called, so a test can control when a popout finishes opening - and therefore
 * stagger two popouts that are in flight at the same time. `setupMockWindow`
 * fires `load` the moment it is subscribed to, which makes every popout in a
 * test resolve in lockstep.
 */
export function setupDeferredMockWindow(): {
    window: Window;
    load: () => void;
} {
    const listeners: Record<string, (() => void)[]> = {};

    let width = 1000;
    let height = 2000;

    const window = fromPartial<Window>({
        addEventListener: (type: string, listener: () => void) => {
            if (!listeners[type]) {
                listeners[type] = [];
            }
            listeners[type].push(listener);
        },
        removeEventListener: (type: string, listener: () => void) => {
            const index = listeners[type]?.indexOf(listener) ?? -1;
            if (index > -1) {
                listeners[type].splice(index, 1);
            }
        },
        dispatchEvent: (event: Event) => {
            listeners[event.type]?.forEach((listener) => listener());
        },
        document: document,
        close: () => {
            listeners['beforeunload']?.forEach((f) => f());
        },
        get innerWidth() {
            return width++;
        },
        get innerHeight() {
            return height++;
        },
    });

    return {
        window,
        load: () => listeners['load']?.forEach((listener) => listener()),
    };
}

export function setupMockWindow() {
    const listeners: Record<string, (() => void)[]> = {};

    let width = 1000;
    let height = 2000;

    return fromPartial<Window>({
        addEventListener: (type: string, listener: () => void) => {
            if (!listeners[type]) {
                listeners[type] = [];
            }
            listeners[type].push(listener);
            if (type === 'load') {
                listener();
            }
        },
        removeEventListener: (type: string, listener: () => void) => {
            if (listeners[type]) {
                const index = listeners[type].indexOf(listener);
                if (index > -1) {
                    listeners[type].splice(index, 1);
                }
            }
        },
        dispatchEvent: (event: Event) => {
            const items = listeners[event.type];
            if (!items) {
                return;
            }
            items.forEach((item) => item());
        },
        document: document,
        close: () => {
            listeners['beforeunload']?.forEach((f) => f());
        },
        get innerWidth() {
            return width++;
        },
        get innerHeight() {
            return height++;
        },
    });
}
