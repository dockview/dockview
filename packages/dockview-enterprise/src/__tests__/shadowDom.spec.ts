import { bindShadowRootListeners, eventOrigin } from '../shadowDom';

describe('shadowDom helpers', () => {
    let shadowHost: HTMLElement;
    let shadow: ShadowRoot;

    const keydownAtDocument = (
        from: Element,
        anchor: Node
    ): { target: EventTarget | null; origin: EventTarget | null } => {
        const seen = {
            target: null as EventTarget | null,
            origin: null as EventTarget | null,
        };
        const listener = (e: Event): void => {
            seen.target = e.target;
            seen.origin = eventOrigin(e, anchor);
        };
        document.addEventListener('keydown', listener, true);
        from.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, composed: true })
        );
        document.removeEventListener('keydown', listener, true);
        return seen;
    };

    beforeEach(() => {
        shadowHost = document.createElement('div');
        document.body.appendChild(shadowHost);
        shadow = shadowHost.attachShadow({ mode: 'open' });
    });

    afterEach(() => {
        shadowHost.remove();
    });

    test('eventOrigin resolves a retargeted event to the node in the anchor tree', () => {
        const anchor = document.createElement('div');
        const button = document.createElement('button');
        anchor.appendChild(button);
        shadow.appendChild(anchor);

        const seen = keydownAtDocument(button, anchor);
        expect(seen.target).toBe(shadowHost); // retargeted at the document
        expect(seen.origin).toBe(button);
    });

    test('eventOrigin keeps a shadow root nested under the anchor retargeted', () => {
        const anchor = document.createElement('div');
        const inner = document.createElement('div');
        anchor.appendChild(inner);
        shadow.appendChild(anchor);
        const innerButton = document.createElement('button');
        inner.attachShadow({ mode: 'open' }).appendChild(innerButton);

        // The anchor's tree only sees the nested host, as with a plain target.
        expect(keydownAtDocument(innerButton, anchor).origin).toBe(inner);
    });

    test('eventOrigin falls back to the target outside dispatch', () => {
        const e = new Event('keydown');
        expect(eventOrigin(e, document.body)).toBe(e.target);
    });

    describe('bindShadowRootListeners', () => {
        test('sees focus moves within the root that the document misses', () => {
            const a = document.createElement('button');
            const b = document.createElement('button');
            shadow.append(a, b);
            const onRoot = jest.fn();
            const onDoc = jest.fn();
            const sub = bindShadowRootListeners(
                () => a,
                [{ type: 'focusin', handler: onRoot, capture: true }]
            );
            document.addEventListener('focusin', onDoc, true);

            a.focus(); // entering from outside: both see it
            b.focus(); // intra-root: only the root sees it

            document.removeEventListener('focusin', onDoc, true);
            expect(onDoc).toHaveBeenCalledTimes(1);
            expect(onRoot).toHaveBeenCalledTimes(2);

            sub.dispose();
            a.focus();
            expect(onRoot).toHaveBeenCalledTimes(2);
        });

        test('binds nothing in the light DOM and rebinds on sync', () => {
            const anchor = document.createElement('div');
            document.body.appendChild(anchor);
            const button = document.createElement('button');
            anchor.appendChild(button);
            const handler = jest.fn();
            const sub = bindShadowRootListeners(
                () => anchor,
                [{ type: 'focusin', handler, capture: true }]
            );

            shadow.appendChild(anchor);
            button.focus();
            expect(handler).not.toHaveBeenCalled(); // not yet synced

            sub.sync();
            button.blur();
            button.focus();
            expect(handler).toHaveBeenCalledTimes(1);

            sub.dispose();
        });
    });
});
