import { DockviewIDisposable as IDisposable } from 'dockview';

/**
 * The node an event came from, as seen from `anchor`'s tree. A listener on the
 * document sees events from a dock mounted in a shadow root retargeted to the
 * shadow host, so walk the composed path to the innermost node that lives in
 * `anchor`'s root (or directly in a document, e.g. a popout). Shadow roots
 * nested inside panel content are still retargeted to their host, as before.
 *
 * Must be called during dispatch: `composedPath()` is empty once the event has
 * finished, and the fallback is then the (retargeted) `e.target`.
 */
export function eventOrigin(e: Event, anchor: Node): EventTarget | null {
    const root = anchor.getRootNode();
    for (const node of e.composedPath?.() ?? []) {
        if (typeof (node as Node).getRootNode !== 'function') {
            continue;
        }
        const nodeRoot = (node as Node).getRootNode();
        if (nodeRoot === root || nodeRoot.nodeType === Node.DOCUMENT_NODE) {
            return node;
        }
    }
    return e.target;
}

/** A document-level listener to mirror across every window the dock occupies. */
export interface DocumentListenerSpec {
    readonly type: string;
    readonly handler: (e: Event) => void;
    /** Capture phase? Must match the value used to remove the listener. */
    readonly capture: boolean;
}

/** The slice of the accessibility host the multi-window binder needs. */
interface MultiWindowHost {
    readonly rootElement: HTMLElement;
    getPopoutWindows(): Window[];
    onDidChangePopouts(listener: () => void): IDisposable;
}

/**
 * Attach `specs` to the main document **and to every popout document**, keeping
 * the set in sync as popouts open and close. A popout window is a separate
 * `document`, so a capture-phase listener on the main document alone never sees
 * keystrokes made inside a popout, so each document needs its own listener.
 *
 * A popout that shares the main document (the jsdom mock) is skipped, since the
 * main document's listener already covers it and a second would double-fire.
 *
 * Returns a disposable that removes every listener from every document.
 */
export function bindDocumentListeners(
    host: MultiWindowHost,
    specs: DocumentListenerSpec[]
): IDisposable {
    const mainDoc = host.rootElement.ownerDocument;
    const attached = new Set<Document>();

    const attach = (doc: Document): void => {
        if (attached.has(doc)) {
            return;
        }
        for (const s of specs) {
            doc.addEventListener(s.type, s.handler, s.capture);
        }
        attached.add(doc);
    };
    const detach = (doc: Document): void => {
        if (!attached.has(doc)) {
            return;
        }
        for (const s of specs) {
            doc.removeEventListener(s.type, s.handler, s.capture);
        }
        attached.delete(doc);
    };

    const sync = (): void => {
        const desired = new Set<Document>([mainDoc]);
        for (const win of host.getPopoutWindows()) {
            const doc = win.document;
            if (doc === mainDoc) {
                continue;
            }
            desired.add(doc);
            attach(doc);
        }
        for (const doc of attached) {
            if (!desired.has(doc)) {
                detach(doc);
            }
        }
    };

    attach(mainDoc);
    sync();
    const sub = host.onDidChangePopouts(sync);

    return {
        dispose: () => {
            sub.dispose();
            for (const doc of attached) {
                detach(doc);
            }
        },
    };
}

/**
 * Attach `specs` to the shadow root hosting `anchor()`, if any. Document-level
 * listeners miss focus moves *within* a shadow root: `focusin`'s target and
 * relatedTarget both retarget to the host, so the event path is cut at the
 * host and never reaches the document. Only focus entering the root from
 * outside is seen there.
 *
 * Call `sync()` to re-check the anchor's root (the dock can be moved into a
 * shadow root after construction); it rebinds when the root changes. An event
 * entering the root from outside reaches both this listener and the document
 * one, so handlers must be idempotent.
 */
export function bindShadowRootListeners(
    anchor: () => Node,
    specs: DocumentListenerSpec[]
): IDisposable & { sync(): void } {
    let bound: ShadowRoot | undefined;

    const detach = (): void => {
        if (!bound) {
            return;
        }
        for (const s of specs) {
            bound.removeEventListener(s.type, s.handler, s.capture);
        }
        bound = undefined;
    };

    const sync = (): void => {
        const root = anchor().getRootNode();
        // A shadow root is the only fragment with a `host`.
        const shadow =
            root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in root
                ? (root as ShadowRoot)
                : undefined;
        if (shadow === bound) {
            return;
        }
        detach();
        if (shadow) {
            for (const s of specs) {
                shadow.addEventListener(s.type, s.handler, s.capture);
            }
            bound = shadow;
        }
    };

    sync();
    return { sync, dispose: detach };
}
