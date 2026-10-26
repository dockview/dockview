import { createDismissableLayer } from '../dismissableLayer';

describe('createDismissableLayer', () => {
    let inside: HTMLElement;
    let outside: HTMLElement;

    beforeEach(() => {
        inside = document.createElement('div');
        outside = document.createElement('div');
        document.body.appendChild(inside);
        document.body.appendChild(outside);
    });

    afterEach(() => {
        inside.remove();
        outside.remove();
    });

    const keydown = (key: string) =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    const pointerdownOn = (el: HTMLElement, x = 0) =>
        el.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true, clientX: x })
        );

    test('Escape dismisses by default; other keys do not', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({ onDismiss });

        keydown('a');
        expect(onDismiss).not.toHaveBeenCalled();
        keydown('Escape');
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('extra keys dismiss when configured', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({ onDismiss, keys: ['Enter'] });

        keydown('Enter');
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('outside pointerdown dismisses; inside (contains) does not', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            elements: () => [inside],
        });

        pointerdownOn(inside);
        expect(onDismiss).not.toHaveBeenCalled();
        pointerdownOn(outside);
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('onInsidePointerDown fires for inside pointerdowns', () => {
        const onDismiss = jest.fn();
        const onInsidePointerDown = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            onInsidePointerDown,
            elements: () => [inside],
        });

        pointerdownOn(inside);
        expect(onInsidePointerDown).toHaveBeenCalledTimes(1);
        expect(onDismiss).not.toHaveBeenCalled();

        layer.dispose();
    });

    test('an isInside predicate overrides the contains check (geometry)', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            isInside: (e) => e.clientX < 100,
        });

        pointerdownOn(outside, 50); // "inside" by geometry
        expect(onDismiss).not.toHaveBeenCalled();
        pointerdownOn(outside, 150); // outside
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('the grace window ignores outside-pointerdowns just after opening', () => {
        const onDismiss = jest.fn();
        let clock = 1000;
        const layer = createDismissableLayer({
            onDismiss,
            elements: () => [inside],
            pointerDownGraceMs: 200,
            now: () => clock,
        });

        clock = 1100; // within the 200ms grace
        pointerdownOn(outside);
        expect(onDismiss).not.toHaveBeenCalled();

        clock = 1300; // past the grace
        pointerdownOn(outside);
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('resize dismisses when enabled, and dispose detaches every listener', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({ onDismiss, resize: true });

        window.dispatchEvent(new Event('resize'));
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        window.dispatchEvent(new Event('resize'));
        keydown('Escape');
        expect(onDismiss).toHaveBeenCalledTimes(1); // no further calls
    });

    test('focusOut dismisses when focus lands outside the layer', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            elements: () => [inside],
        });

        inside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(onDismiss).not.toHaveBeenCalled();
        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('focusOut uses an isFocusInside predicate when provided', () => {
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            isFocusInside: (el) => el === inside,
        });

        inside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(onDismiss).not.toHaveBeenCalled();
        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('pointerdown and focusin inside a shadow root count as inside', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const menu = document.createElement('div');
        const item = document.createElement('button');
        menu.appendChild(item);
        root.appendChild(menu);

        const onDismiss = jest.fn();
        const onInsidePointerDown = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            onInsidePointerDown,
            focusOut: true,
            elements: () => [menu],
        });

        item.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        item.dispatchEvent(
            new FocusEvent('focusin', { bubbles: true, composed: true })
        );
        expect(onInsidePointerDown).toHaveBeenCalledTimes(1);
        expect(onDismiss).not.toHaveBeenCalled();

        pointerdownOn(outside);
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        host.remove();
    });

    // Regression guard: this layout already worked through retargeting; the
    // composed-path check must keep it working.
    test('pointerdown and focusin inside a web component within the layer count as inside', () => {
        const host = document.createElement('div');
        inside.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const item = document.createElement('button');
        root.appendChild(item);

        const onDismiss = jest.fn();
        const onInsidePointerDown = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            onInsidePointerDown,
            focusOut: true,
            elements: () => [inside],
        });

        item.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        item.dispatchEvent(
            new FocusEvent('focusin', { bubbles: true, composed: true })
        );
        expect(onInsidePointerDown).toHaveBeenCalledTimes(1);
        expect(onDismiss).not.toHaveBeenCalled();

        pointerdownOn(outside);
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
    });

    test('focusOut sees focus moving within the shadow root the layer lives in', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const menu = document.createElement('div');
        const item = document.createElement('button');
        menu.appendChild(item);
        const elsewhere = document.createElement('button');
        shadowRoot.append(menu, elsewhere);

        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            elements: () => [menu],
        });

        // Entering the shadow root reaches both the root and the window
        // listeners; it must count once, as inside.
        item.focus();
        expect(onDismiss).not.toHaveBeenCalled();

        // A move within the root never reaches the window.
        elsewhere.focus();
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        host.remove();
    });

    test('a custom isFocusInside gets the focus target as the window sees it', () => {
        const panel = document.createElement('div');
        document.body.appendChild(panel);
        const componentHost = document.createElement('div');
        panel.appendChild(componentHost);
        const input = document.createElement('input');
        componentHost.attachShadow({ mode: 'open' }).appendChild(input);

        const onDismiss = jest.fn();
        const isFocusInside = jest.fn((el: Element) => panel.contains(el));
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            isFocusInside,
        });

        input.focus();
        expect(isFocusInside).toHaveBeenCalledWith(componentHost);
        expect(onDismiss).not.toHaveBeenCalled();

        layer.dispose();
        panel.remove();
    });
    test('a custom isFocusInside sees the layer\u2019s own tree, not one collapsed host', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const menu = document.createElement('div');
        const first = document.createElement('button');
        menu.appendChild(first);
        const elsewhere = document.createElement('button');
        // A nested web component *inside* the layer still retargets to its own
        // host, as it would for a light-DOM layer.
        const componentHost = document.createElement('div');
        menu.appendChild(componentHost);
        const inComponent = document.createElement('button');
        componentHost.attachShadow({ mode: 'open' }).appendChild(inComponent);
        shadowRoot.append(menu, elsewhere);

        const seen: Element[] = [];
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            elements: () => [menu],
            isFocusInside: (el) => {
                seen.push(el);
                return menu.contains(el);
            },
        });

        // Retargeting everything out to `host` would make all three of these
        // indistinguishable, so the layer could never close.
        first.focus();
        expect(seen.at(-1)).toBe(first);
        inComponent.focus();
        expect(seen.at(-1)).toBe(componentHost);
        expect(onDismiss).not.toHaveBeenCalled();

        elsewhere.focus();
        expect(seen.at(-1)).toBe(elsewhere);
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        host.remove();
    });

    test('an onDismiss that moves focus dismisses only once', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const menu = document.createElement('div');
        const item = document.createElement('button');
        menu.appendChild(item);
        const elsewhere = document.createElement('button');
        shadowRoot.append(menu, elsewhere);
        // Where focus is returned on close, as the auto-hide peek does. It is
        // inside the layer, so the nested event is not itself a dismissal.
        const restoreTo = document.createElement('button');
        menu.appendChild(restoreTo);

        // Re-entrant: the nested focusin lands while the outer one is still on
        // the stack, so a single-slot dedupe would let the outer event through
        // the second listener and dismiss again.
        const onDismiss = jest.fn(() => restoreTo.focus());
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            elements: () => [menu],
        });

        item.focus();
        elsewhere.focus();

        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        host.remove();
    });

    test('focusOut sees a move within an outer shadow root when the layer is nested', () => {
        const outerHost = document.createElement('div');
        document.body.appendChild(outerHost);
        const outerRoot = outerHost.attachShadow({ mode: 'open' });
        const innerHost = document.createElement('div');
        const siblingInOuter = document.createElement('button');
        outerRoot.append(innerHost, siblingInOuter);
        const innerRoot = innerHost.attachShadow({ mode: 'open' });
        const menu = document.createElement('div');
        const item = document.createElement('button');
        menu.appendChild(item);
        innerRoot.appendChild(menu);

        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            elements: () => [menu],
        });

        item.focus();
        expect(onDismiss).not.toHaveBeenCalled();

        // Cut at the outer host, so neither the window nor the inner root
        // sees this; only a listener on the outer root does.
        siblingInOuter.focus();
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        outerHost.remove();
    });

    test('focusOut binds the shadow root of a surface attached after the layer', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const elsewhere = document.createElement('button');
        shadowRoot.appendChild(elsewhere);

        let menu: HTMLElement | undefined;
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            elements: () => (menu ? [menu] : []),
        });

        // The surface appears only now: its root was not readable at
        // construction.
        menu = document.createElement('div');
        const item = document.createElement('button');
        menu.appendChild(item);
        shadowRoot.appendChild(menu);

        item.focus(); // reaches the window, which re-syncs the roots
        expect(onDismiss).not.toHaveBeenCalled();

        elsewhere.focus(); // intra-root, needs the newly bound listener
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        host.remove();
    });
    test('anchor lets a geometry-only layer see focus moves within its shadow root', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const dock = document.createElement('div');
        const peek = document.createElement('div');
        const inPeek = document.createElement('button');
        peek.appendChild(inPeek);
        const outside = document.createElement('button');
        dock.append(peek, outside);
        shadowRoot.appendChild(dock);

        // The auto-hide peek's shape: inside/outside is decided by geometry,
        // so there are no `elements` to find the shadow root from.
        const onDismiss = jest.fn();
        const layer = createDismissableLayer({
            onDismiss,
            focusOut: true,
            capture: true,
            isFocusInside: (el) => peek.contains(el) || el === host,
            anchor: () => dock,
        });

        inPeek.focus();
        expect(onDismiss).not.toHaveBeenCalled();

        // Never reaches the window; only a listener on the shadow root sees it.
        outside.focus();
        expect(onDismiss).toHaveBeenCalledTimes(1);

        layer.dispose();
        host.remove();
    });
});
