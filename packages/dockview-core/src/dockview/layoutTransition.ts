import type { IDisposable } from '../lifecycle';

function leaves(root: HTMLElement): Map<Element, HTMLElement> {
    const result = new Map<Element, HTMLElement>();
    for (const view of Array.from(
        root.querySelectorAll<HTMLElement>('.dv-view')
    )) {
        const child = view.firstElementChild;
        if (child && !child.classList.contains('dv-branch-node')) {
            result.set(child, view);
        }
    }
    return result;
}

function sameBox(a: DOMRect, b: DOMRect): boolean {
    return (
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5
    );
}

function prefersReducedMotion(root: HTMLElement): boolean {
    const view = root.ownerDocument.defaultView;
    return !!view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function box(rect: DOMRect, parent: DOMRect): Keyframe {
    return {
        left: `${rect.left - parent.left}px`,
        top: `${rect.top - parent.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
    };
}

/** Animates grid views from their old boxes to their new ones. */
export class LayoutTransition implements IDisposable {
    private _finish: (() => void) | undefined;

    constructor(
        private readonly root: () => HTMLElement,
        private readonly onFrame: () => void,
        private readonly duration = 180
    ) {}

    run(change: () => void): void {
        const root = this.root();
        const before = new Map<Element, DOMRect>();
        for (const [view, container] of leaves(root)) {
            before.set(view, container.getBoundingClientRect());
        }

        this.finish();
        change();

        if (this.duration <= 0 || prefersReducedMotion(root)) {
            return;
        }

        const animations: Animation[] = [];
        for (const [view, container] of leaves(root)) {
            const from = before.get(view);
            const to = container.getBoundingClientRect();
            const parent = container.parentElement?.getBoundingClientRect();
            if (
                !from ||
                !parent ||
                sameBox(from, to) ||
                typeof container.animate !== 'function'
            ) {
                continue;
            }
            animations.push(
                container.animate([box(from, parent), box(to, parent)], {
                    duration: this.duration,
                    easing: 'ease-out',
                })
            );
        }

        if (animations.length === 0) {
            return;
        }

        const win = root.ownerDocument.defaultView ?? window;
        const { onFrame, duration } = this;
        const start = performance.now();
        let frame = win.requestAnimationFrame(function tick(): void {
            onFrame();
            if (performance.now() - start < duration) {
                frame = win.requestAnimationFrame(tick);
            }
        });
        const timer = win.setTimeout(() => this.finish(), duration);

        this._finish = () => {
            win.cancelAnimationFrame(frame);
            win.clearTimeout(timer);
            for (const animation of animations) {
                animation.cancel();
            }
            this.onFrame();
            // Overlays reposition a frame later; settle them once more.
            win.requestAnimationFrame(() =>
                win.requestAnimationFrame(() => this.onFrame())
            );
        };
    }

    finish(): void {
        const finish = this._finish;
        this._finish = undefined;
        finish?.();
    }

    dispose(): void {
        this.finish();
    }
}
