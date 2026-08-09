import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from 'dockview-core';
import { IContentRenderer } from 'dockview-core';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    constructor() {
        this.element.className = 'dv-test-content';
    }
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

/**
 * Auto-hide ("pinnable") edge groups follow the VS tool-window model. A collapsed
 * edge group's native tabs are click triggers (no hover): click a tab → peek it as a
 * non-reflowing overlay with a title bar (title + pin + close); click it again /
 * outside / Esc → hide; pin → dock; close → close the panel.
 */
describe('auto-hide edge groups', () => {
    let container: HTMLElement;

    const make = (
        autoHideEdgeGroups: DockviewComponent['options']['autoHideEdgeGroups'],
        extra: Partial<DockviewComponent['options']> = {}
    ): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            autoHideEdgeGroups,
            ...extra,
        });
        dockview.layout(1000, 1000);
        return dockview;
    };

    const collapsedEdgeWithPanel = (
        dockview: DockviewComponent,
        title = 'Explorer'
    ): void => {
        dockview.addEdgeGroup('left', { id: 'edge-left', initialSize: 200 });
        dockview.addPanel({
            id: 'p1',
            component: 'default',
            title,
            position: { referenceGroup: 'edge-left', direction: 'within' },
        });
        dockview.autoHideEdgeGroup('left');
    };

    const peek = (): HTMLElement | null =>
        container.querySelector('.dv-edge-peek');
    const collapsed = (d: DockviewComponent): boolean =>
        d.getEdgeGroup('left')!.isCollapsed();
    const strip = (d: DockviewComponent): HTMLElement =>
        d.getEdgeGroupPanel('left')!.element;
    const tabs = (d: DockviewComponent): HTMLElement[] =>
        Array.from(strip(d).querySelectorAll('.dv-tab'));

    afterEach(() => {
        container.remove();
    });

    test('api.peekEdgeGroup opens a non-reflowing peek with the content reparented', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);

        d.api.peekEdgeGroup('left', true);
        const overlay = peek();
        expect(overlay).toBeTruthy();
        expect(overlay!.querySelector('.dv-test-content')).toBeTruthy();
        expect(collapsed(d)).toBe(true); // no grid reflow

        d.api.peekEdgeGroup('left', false);
        expect(peek()).toBeNull();
        expect(strip(d).querySelector('.dv-test-content')).toBeTruthy();

        d.dispose();
    });

    test('clicking a tab peeks it; clicking it again hides it (no reflow)', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);

        fireEvent.click(tabs(d)[0]);
        expect(peek()).toBeTruthy();
        expect(collapsed(d)).toBe(true); // native expand suppressed

        fireEvent.click(tabs(d)[0]);
        expect(peek()).toBeNull();
        expect(collapsed(d)).toBe(true);

        d.dispose();
    });

    test('the peek has a title bar with the title, a pin and a close button', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d, 'Explorer');
        d.api.peekEdgeGroup('left', true);

        const title = container.querySelector('.dv-edge-peek-title');
        const pin = container.querySelector('.dv-edge-peek-pin');
        const close = container.querySelector('.dv-edge-peek-close');
        expect(title?.textContent).toBe('Explorer');
        expect(pin?.getAttribute('aria-label')).toBe('Pin');
        expect(close?.getAttribute('aria-label')).toBe('Close');

        d.dispose();
    });

    test('the pin button re-docks (expands) the group and removes the peek', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        d.api.peekEdgeGroup('left', true);

        (container.querySelector('.dv-edge-peek-pin') as HTMLElement).click();

        expect(collapsed(d)).toBe(false);
        expect(peek()).toBeNull();

        d.dispose();
    });

    test('the close button closes the panel and removes the peek', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        d.api.peekEdgeGroup('left', true);

        (container.querySelector('.dv-edge-peek-close') as HTMLElement).click();

        expect(peek()).toBeNull();
        expect(d.panels.find((p) => p.id === 'p1')).toBeUndefined();

        d.dispose();
    });

    test('Escape closes the peek, restores content, stays collapsed', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        d.api.peekEdgeGroup('left', true);
        expect(peek()).toBeTruthy();

        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );

        expect(peek()).toBeNull();
        expect(collapsed(d)).toBe(true);
        expect(strip(d).querySelector('.dv-test-content')).toBeTruthy();

        d.dispose();
    });

    test('clicking outside hides; clicking empty strip space does not', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        d.api.peekEdgeGroup('left', true);

        // give the strip a real box; the peek/overlay rects stay 0×0 at origin
        jest.spyOn(strip(d), 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            right: 40,
            bottom: 600,
            width: 40,
            height: 600,
            x: 0,
            y: 0,
            toJSON() {},
        } as DOMRect);

        // pointer-down on empty strip space → stays open
        fireEvent.pointerDown(document, { clientX: 20, clientY: 300 });
        expect(peek()).toBeTruthy();

        // pointer-down outside the strip + peek → hides
        fireEvent.pointerDown(document, { clientX: 500, clientY: 300 });
        expect(peek()).toBeNull();

        d.dispose();
    });

    test('group.api.isPeeking + onDidPeekChange reflect the peek', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        const api = d.getEdgeGroup('left')!;
        const events: boolean[] = [];
        const sub = api.onDidPeekChange((e) => events.push(e.isPeeking));

        expect(api.isPeeking()).toBe(false);
        d.api.peekEdgeGroup('left', true);
        expect(api.isPeeking()).toBe(true);
        d.api.peekEdgeGroup('left', false);
        expect(api.isPeeking()).toBe(false);
        expect(events).toEqual([true, false]);

        sub.dispose();
        d.dispose();
    });

    test('clicking a different tab switches the peeked panel and retitles', () => {
        const d = make(true);
        d.addEdgeGroup('left', { id: 'edge-left', initialSize: 200 });
        const p1 = d.addPanel({
            id: 'p1',
            component: 'default',
            title: 'One',
            position: { referenceGroup: 'edge-left', direction: 'within' },
        });
        d.addPanel({
            id: 'p2',
            component: 'default',
            title: 'Two',
            position: { referenceGroup: 'edge-left', direction: 'within' },
        });
        p1.api.setActive();
        d.autoHideEdgeGroup('left');

        fireEvent.click(tabs(d)[0]); // peek One
        expect(peek()).toBeTruthy();
        expect(
            container.querySelector('.dv-edge-peek-title')?.textContent
        ).toBe('One');

        fireEvent.click(tabs(d)[1]); // switch to Two
        expect(peek()).toBeTruthy();
        expect(d.getEdgeGroupPanel('left')!.activePanel!.id).toBe('p2');
        expect(
            container.querySelector('.dv-edge-peek-title')?.textContent
        ).toBe('Two');

        d.dispose();
    });

    test('the peek gets an opaque background so it is never see-through', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        strip(d).style.backgroundColor = 'rgb(10, 20, 30)';

        d.api.peekEdgeGroup('left', true);
        expect(peek()!.style.backgroundColor).toBe('rgb(10, 20, 30)');

        d.dispose();
    });

    test('the title bar takes the tab-bar colour, the backdrop the group frame', () => {
        const d = make(true);
        collapsedEdgeWithPanel(d);
        // Distinct frame (group) vs tab-bar (tab strip) colours — in dark/spaced
        // themes the frame is the near-black inter-group gap colour, so the title
        // bar must take the lighter tab-bar colour rather than reading as black.
        strip(d).style.backgroundColor = 'rgb(11, 6, 17)'; // frame
        const stripBar = strip(d).querySelector(
            '.dv-tabs-and-actions-container'
        ) as HTMLElement;
        expect(stripBar).toBeTruthy();
        stripBar.style.backgroundColor = 'rgb(22, 18, 31)'; // tab bar

        d.api.peekEdgeGroup('left', true);
        const header = container.querySelector(
            '.dv-edge-peek-header'
        ) as HTMLElement;
        expect(header.style.backgroundColor).toBe('rgb(22, 18, 31)'); // tab bar
        expect(peek()!.style.backgroundColor).toBe('rgb(11, 6, 17)'); // frame

        d.dispose();
    });

    test('off (default): peeking is a no-op', () => {
        const d = make(undefined);
        collapsedEdgeWithPanel(d);

        expect(collapsed(d)).toBe(true);
        d.api.peekEdgeGroup('left', true);
        expect(peek()).toBeNull();

        d.dispose();
    });

    describe('docked (pinned) tool-window chrome', () => {
        test('pinning renders a docked title bar and moves tabs to the bottom', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d, 'Explorer');
            expect(collapsed(d)).toBe(true);

            // pin (expand)
            d.api.peekEdgeGroup('left', true);
            (
                container.querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click();
            expect(collapsed(d)).toBe(false);

            // docked chrome: a title bar inside the group + header at the bottom
            const bar = strip(d).querySelector(
                '.dv-edge-peek-header'
            ) as HTMLElement;
            expect(bar).toBeTruthy();
            expect(bar.querySelector('.dv-edge-peek-title')?.textContent).toBe(
                'Explorer'
            );
            expect(d.getEdgeGroupPanel('left')!.api.getHeaderPosition()).toBe(
                'bottom'
            );

            d.dispose();
        });

        test('auto-hiding (docked pin) removes the chrome and restores the strip orientation', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d, 'Explorer');
            d.api.peekEdgeGroup('left', true);
            (
                container.querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click(); // dock
            expect(collapsed(d)).toBe(false);

            // the docked pushpin auto-hides
            (
                strip(d).querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click();

            expect(collapsed(d)).toBe(true);
            expect(strip(d).querySelector('.dv-edge-peek-header')).toBeNull();
            // strip orientation restored to the edge position
            expect(d.getEdgeGroupPanel('left')!.api.getHeaderPosition()).toBe(
                'left'
            );

            d.dispose();
        });

        test('pinning tags the group as a tool window; auto-hiding untags it', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d);
            d.api.peekEdgeGroup('left', true);

            // pin (dock) → the group is a tool window (spaced themes reshape its
            // rounding off this class)
            (
                container.querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click();
            expect(strip(d).classList.contains('dv-edge-tool-window')).toBe(
                true
            );

            // the docked pushpin auto-hides → the tag is removed
            (
                strip(d).querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click();
            expect(strip(d).classList.contains('dv-edge-tool-window')).toBe(
                false
            );

            d.dispose();
        });

        test('the docked close button closes the active panel', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d);
            d.api.peekEdgeGroup('left', true);
            (
                container.querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click(); // dock

            (
                strip(d).querySelector('.dv-edge-peek-close') as HTMLElement
            ).click();
            expect(d.panels.find((p) => p.id === 'p1')).toBeUndefined();

            d.dispose();
        });
    });

    describe('accessibility', () => {
        test('Enter on a focused tab toggles the peek (focus into content)', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d);
            const tab = tabs(d)[0];
            tab.focus();

            fireEvent.keyDown(tab, { key: 'Enter' });
            expect(peek()).toBeTruthy();
            expect(peek()!.contains(document.activeElement)).toBe(true);

            fireEvent.keyDown(tab, { key: 'Enter' });
            expect(peek()).toBeNull();

            d.dispose();
        });

        test('Escape returns focus to the tab', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d);
            const tab = tabs(d)[0];
            tab.focus();
            fireEvent.keyDown(tab, { key: 'Enter' });
            expect(peek()!.contains(document.activeElement)).toBe(true);

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );

            expect(peek()).toBeNull();
            expect(document.activeElement).toBe(tab);

            d.dispose();
        });

        test('focus landing outside the peek closes it (keyboard tab-away)', () => {
            const d = make(true);
            collapsedEdgeWithPanel(d);
            d.api.peekEdgeGroup('left', true);
            expect(peek()).toBeTruthy();

            // the strip is the keep-open region (peek/header rects stay 0×0)
            jest.spyOn(strip(d), 'getBoundingClientRect').mockReturnValue({
                left: 0,
                top: 0,
                right: 40,
                bottom: 600,
                width: 40,
                height: 600,
                x: 0,
                y: 0,
                toJSON() {},
            } as DOMRect);

            const mkAt = (cx: number, cy: number): HTMLElement => {
                const el = document.createElement('button');
                document.body.appendChild(el);
                jest.spyOn(el, 'getBoundingClientRect').mockReturnValue({
                    left: cx - 5,
                    top: cy - 5,
                    right: cx + 5,
                    bottom: cy + 5,
                    width: 10,
                    height: 10,
                    x: cx - 5,
                    y: cy - 5,
                    toJSON() {},
                } as DOMRect);
                return el;
            };

            // focus inside the region → stays open
            const inside = mkAt(20, 300);
            inside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            expect(peek()).toBeTruthy();

            // focus outside → closes
            const outside = mkAt(500, 500);
            outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            expect(peek()).toBeNull();

            inside.remove();
            outside.remove();
            d.dispose();
        });

        test('announces the panel when peeked and when pinned', () => {
            const messages: string[] = [];
            const d = make(true, {
                announcer: (e) => messages.push(e.message),
            });
            collapsedEdgeWithPanel(d, 'Explorer');

            d.api.peekEdgeGroup('left', true);
            expect(messages).toContain('Explorer shown');

            (
                container.querySelector('.dv-edge-peek-pin') as HTMLElement
            ).click();
            expect(messages).toContain('Explorer pinned');

            d.dispose();
        });
    });
});
