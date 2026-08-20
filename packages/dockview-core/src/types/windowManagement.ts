/**
 * Types for the Window Management API (Chromium 100+).
 *
 * These interfaces are not yet in TypeScript's `lib.dom.d.ts`, and
 * dockview-core carries no runtime or type dependencies, so the minimal
 * surface dockview uses is declared here. Every member dockview touches is
 * optional on the existing globals (`Window.getScreenDetails`,
 * `Screen.isExtended`) so this file never asserts capability — feature
 * detection stays a runtime check.
 *
 * This is a module (not an ambient `.d.ts`) on purpose: `tsc` with
 * `emitDeclarationOnly` does not copy input `.d.ts` files into `dist`, so an
 * ambient file would leave the published `screenManager.d.ts` referencing
 * undefined names. As a module its declaration IS emitted, and the
 * `declare global` block rides along with it.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API
 */

export interface ScreenDetailed extends Screen {
    /** Full-bounds origin of this screen in the multi-screen coordinate space. */
    readonly left: number;
    readonly top: number;
    /** Work-area (minus taskbars/docks) origin in the multi-screen space. */
    readonly availLeft: number;
    readonly availTop: number;
    readonly devicePixelRatio: number;
    readonly isPrimary: boolean;
    readonly isInternal: boolean;
    /** User-friendly name, e.g. a monitor model. Empty until permission is granted. */
    readonly label: string;
}

export interface ScreenDetails extends EventTarget {
    readonly screens: ReadonlyArray<ScreenDetailed>;
    readonly currentScreen: ScreenDetailed;
    onscreenschange: ((this: ScreenDetails, ev: Event) => unknown) | null;
    oncurrentscreenchange: ((this: ScreenDetails, ev: Event) => unknown) | null;
}

declare global {
    interface Window {
        /**
         * Window Management API entry point. Requires transient activation
         * while the `window-management` permission is in the `prompt` state;
         * callable without a gesture once granted. Rejects with
         * `NotAllowedError` when denied.
         */
        getScreenDetails?(): Promise<ScreenDetails>;
    }

    interface Screen {
        /** True when the device has more than one screen (permission-gated). */
        readonly isExtended?: boolean;
    }
}
