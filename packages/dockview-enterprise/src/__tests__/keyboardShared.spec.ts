import type {
    DockviewIDisposable as IDisposable,
    KeyboardNavigationOptions,
} from 'dockview';
import {
    KEYBOARD_MOVE_ATTRIBUTE,
    matchesBinding,
    readKeyboardNavigation,
} from '../keyboardShared';
import { type DocumentListenerSpec, bindDocumentListeners } from '../shadowDom';

/**
 * Minimal stand-in for the accessibility host that `bindDocumentListeners`
 * needs: a `rootElement` (whose `ownerDocument` is the main document),
 * `getPopoutWindows()` and `onDidChangePopouts()`. Emitting a change re-runs
 * every subscribed sync callback, mirroring popouts opening/closing.
 */
class FakeHost {
    readonly rootElement: HTMLElement;
    popouts: Window[] = [];
    private readonly listeners = new Set<() => void>();

    constructor(rootElement: HTMLElement = document.createElement('div')) {
        this.rootElement = rootElement;
    }

    getPopoutWindows(): Window[] {
        return this.popouts;
    }

    onDidChangePopouts(listener: () => void): IDisposable {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    /** Number of live popout subscriptions (0 once disposed). */
    get subscriptionCount(): number {
        return this.listeners.size;
    }

    emitChange(): void {
        for (const l of Array.from(this.listeners)) {
            l();
        }
    }
}

/** Create a fresh jsdom `Document` and wrap it as a fake popout `Window`. */
function makePopoutWindow(): { win: Window; doc: Document } {
    const doc = document.implementation.createHTMLDocument('popout');
    const win = { document: doc } as unknown as Window;
    return { win, doc };
}

function makeSpecs(): DocumentListenerSpec[] {
    return [
        { type: 'keydown', handler: jest.fn(), capture: true },
        { type: 'keyup', handler: jest.fn(), capture: false },
    ];
}

describe('keyboardShared', () => {
    describe('KEYBOARD_MOVE_ATTRIBUTE', () => {
        test('is the shared DOM coordination attribute', () => {
            expect(KEYBOARD_MOVE_ATTRIBUTE).toBe('data-dv-kbd-moving');
        });
    });

    describe('matchesBinding', () => {
        function evt(init: Partial<KeyboardEventInit> & { key: string }) {
            return new KeyboardEvent('keydown', init);
        }

        test('matches a plain key with no modifiers', () => {
            expect(matchesBinding(evt({ key: 'F6' }), 'f6')).toBe(true);
        });

        test('is case-insensitive on the final key part', () => {
            expect(matchesBinding(evt({ key: 'A' }), 'a')).toBe(true);
            expect(matchesBinding(evt({ key: 'a' }), 'A')).toBe(true);
        });

        test('matches ctrl modifier exactly', () => {
            expect(
                matchesBinding(evt({ key: ']', ctrlKey: true }), 'ctrl+]')
            ).toBe(true);
            // ctrl required but not held -> no match
            expect(matchesBinding(evt({ key: ']' }), 'ctrl+]')).toBe(false);
            // ctrl held but binding does not ask for it -> no match
            expect(matchesBinding(evt({ key: ']', ctrlKey: true }), ']')).toBe(
                false
            );
        });

        test('matches shift modifier exactly', () => {
            expect(
                matchesBinding(evt({ key: 'F6', shiftKey: true }), 'shift+f6')
            ).toBe(true);
            expect(
                matchesBinding(evt({ key: 'F6', shiftKey: true }), 'f6')
            ).toBe(false);
        });

        test('matches alt modifier exactly', () => {
            expect(
                matchesBinding(evt({ key: 'x', altKey: true }), 'alt+x')
            ).toBe(true);
            expect(matchesBinding(evt({ key: 'x' }), 'alt+x')).toBe(false);
        });

        test('treats both "meta" and "cmd" as the meta modifier', () => {
            expect(
                matchesBinding(evt({ key: 'k', metaKey: true }), 'meta+k')
            ).toBe(true);
            expect(
                matchesBinding(evt({ key: 'k', metaKey: true }), 'cmd+k')
            ).toBe(true);
            expect(matchesBinding(evt({ key: 'k' }), 'cmd+k')).toBe(false);
        });

        test('matches multiple modifiers together', () => {
            expect(
                matchesBinding(
                    evt({ key: 'F6', ctrlKey: true, shiftKey: true }),
                    'ctrl+shift+f6'
                )
            ).toBe(true);
            // one extra modifier held that the binding did not request
            expect(
                matchesBinding(
                    evt({
                        key: 'F6',
                        ctrlKey: true,
                        shiftKey: true,
                        altKey: true,
                    }),
                    'ctrl+shift+f6'
                )
            ).toBe(false);
        });
    });

    describe('readKeyboardNavigation', () => {
        test('returns undefined when the opt-in is falsy', () => {
            expect(
                readKeyboardNavigation({ keyboardNavigation: false } as any)
            ).toBeUndefined();
            expect(readKeyboardNavigation({} as any)).toBeUndefined();
        });

        test('returns an empty options object when the opt-in is `true`', () => {
            expect(
                readKeyboardNavigation({ keyboardNavigation: true } as any)
            ).toEqual({});
        });

        test('passes through an explicit options object', () => {
            const opts: KeyboardNavigationOptions =
                {} as KeyboardNavigationOptions;
            expect(
                readKeyboardNavigation({ keyboardNavigation: opts } as any)
            ).toBe(opts);
        });
    });

    describe('bindDocumentListeners', () => {
        let mainDoc: Document;

        beforeEach(() => {
            mainDoc = document.body.ownerDocument;
        });

        test('attaches every spec to the main document on bind', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const add = jest.spyOn(mainDoc, 'addEventListener');

            const disposable = bindDocumentListeners(host, specs);

            expect(add).toHaveBeenCalledWith('keydown', specs[0].handler, true);
            expect(add).toHaveBeenCalledWith('keyup', specs[1].handler, false);

            add.mockRestore();
            disposable.dispose();
        });

        test('attaches listeners to a popout document added via sync', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const disposable = bindDocumentListeners(host, specs);

            const { win, doc } = makePopoutWindow();
            const add = jest.spyOn(doc, 'addEventListener');

            host.popouts = [win];
            host.emitChange();

            expect(add).toHaveBeenCalledTimes(specs.length);
            expect(add).toHaveBeenCalledWith('keydown', specs[0].handler, true);
            expect(add).toHaveBeenCalledWith('keyup', specs[1].handler, false);

            disposable.dispose();
        });

        test('detaches listeners when a popout document is removed', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const disposable = bindDocumentListeners(host, specs);

            const { win, doc } = makePopoutWindow();
            host.popouts = [win];
            host.emitChange();

            const remove = jest.spyOn(doc, 'removeEventListener');

            // popout closed
            host.popouts = [];
            host.emitChange();

            expect(remove).toHaveBeenCalledTimes(specs.length);
            expect(remove).toHaveBeenCalledWith(
                'keydown',
                specs[0].handler,
                true
            );
            expect(remove).toHaveBeenCalledWith(
                'keyup',
                specs[1].handler,
                false
            );

            disposable.dispose();
        });

        test('is idempotent: an unchanged popout set does not re-add listeners', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const disposable = bindDocumentListeners(host, specs);

            const { win, doc } = makePopoutWindow();
            host.popouts = [win];
            host.emitChange();

            const add = jest.spyOn(doc, 'addEventListener');
            // fire more sync events without changing the popout set
            host.emitChange();
            host.emitChange();

            expect(add).not.toHaveBeenCalled();

            disposable.dispose();
        });

        test('skips a popout that shares the main document (no double listeners)', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const disposable = bindDocumentListeners(host, specs);

            const add = jest.spyOn(mainDoc, 'addEventListener');
            // a popout window that reuses the jsdom main document
            const sharedWin = { document: mainDoc } as unknown as Window;
            host.popouts = [sharedWin];
            host.emitChange();

            expect(add).not.toHaveBeenCalled();

            add.mockRestore();
            disposable.dispose();
        });

        test('dispose removes every listener and unsubscribes from popout changes', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const disposable = bindDocumentListeners(host, specs);

            const { win: winA, doc: docA } = makePopoutWindow();
            const { win: winB, doc: docB } = makePopoutWindow();
            host.popouts = [winA, winB];
            host.emitChange();

            const removeMain = jest.spyOn(mainDoc, 'removeEventListener');
            const removeA = jest.spyOn(docA, 'removeEventListener');
            const removeB = jest.spyOn(docB, 'removeEventListener');

            expect(host.subscriptionCount).toBe(1);
            disposable.dispose();

            expect(host.subscriptionCount).toBe(0);
            expect(removeMain).toHaveBeenCalledTimes(specs.length);
            expect(removeA).toHaveBeenCalledTimes(specs.length);
            expect(removeB).toHaveBeenCalledTimes(specs.length);

            removeMain.mockRestore();
        });

        test('keeps unchanged popouts attached while adding a new one', () => {
            const host = new FakeHost(document.body);
            const specs = makeSpecs();
            const disposable = bindDocumentListeners(host, specs);

            const { win: winA, doc: docA } = makePopoutWindow();
            host.popouts = [winA];
            host.emitChange();

            const addA = jest.spyOn(docA, 'addEventListener');
            const { win: winB, doc: docB } = makePopoutWindow();
            const addB = jest.spyOn(docB, 'addEventListener');

            host.popouts = [winA, winB];
            host.emitChange();

            // existing popout untouched, new popout attached
            expect(addA).not.toHaveBeenCalled();
            expect(addB).toHaveBeenCalledTimes(specs.length);

            disposable.dispose();
        });
    });
});
