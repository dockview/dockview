import { Emitter, Event } from '../events';
import { CompositeDisposable, Disposable } from '../lifecycle';
import { Box } from '../types';
import { defineModule } from './modules';

/**
 * Facade over the Window Management API (design doc:
 * proposals/chrome-multi-window-support.md §4.1). All Window-Management calls
 * in dockview go through this service so the rest of the codebase never
 * touches `getScreenDetails()` directly and testing is a matter of mocking
 * one object.
 *
 * The module is defined here (core owns the contracts and implementation)
 * and registered by `dockview-enterprise`'s self-registering `Modules` list
 * (the DV-94 packaging decision). Core tests exercise it via the internal
 * `modules` construction seam so they need no enterprise import.
 */

export type WindowManagementPermissionState =
    | 'granted'
    | 'prompt'
    | 'denied'
    | 'unsupported';

export interface DockviewScreen {
    /**
     * Stable within a session; best-effort across sessions (derived from the
     * screen label and position — a host adapter can substitute genuinely
     * stable ids, e.g. Electron's `Display.id`).
     */
    readonly id: string;
    /** e.g. 'DELL U2720Q' — empty until the permission is granted. */
    readonly label: string;
    readonly isPrimary: boolean;
    /** Built-in display (laptop panel). */
    readonly isInternal: boolean;
    /** Hosts the window this manager was created for. */
    readonly isCurrent: boolean;
    /** Full bounds in the multi-screen coordinate space. */
    readonly bounds: Box;
    /** Bounds minus taskbars/docks. */
    readonly workArea: Box;
    readonly devicePixelRatio: number;
    /** Underlying ScreenDetailed, when available (undefined in fallback mode). */
    readonly native?: ScreenDetailed;
}

/** How to size/anchor a popout on its target screen. */
export type ScreenPlacement =
    | { type: 'center'; width?: number; height?: number }
    | { type: 'fill' }
    /** Explicit box relative to the screen's workArea origin. */
    | { type: 'box'; box: Box };

/** Accepted anywhere a screen can be named. */
export type DockviewScreenTarget =
    | DockviewScreen
    | 'primary'
    | 'current'
    /** Index into the current screens snapshot. */
    | number;

export interface DockviewScreensChangeEvent {
    readonly screens: readonly DockviewScreen[];
    /** Screens hotplugged in this change. */
    readonly added: readonly DockviewScreen[];
    /** Screens unplugged in this change. */
    readonly removed: readonly DockviewScreen[];
    /**
     * Screens present before and after whose geometry (bounds / work area)
     * changed in place — e.g. a resolution or taskbar change. A screen that
     * merely became (or stopped being) the current one is not included.
     */
    readonly changed: readonly DockviewScreen[];
}

/**
 * The slice of `Window` the ScreenManager reads. Structural so tests (and
 * eventually adapters) can supply a fake without building a full `Window`.
 */
export interface ScreenManagerWindow {
    readonly screen: {
        readonly width: number;
        readonly height: number;
        readonly availWidth: number;
        readonly availHeight: number;
        readonly isExtended?: boolean;
    };
    readonly devicePixelRatio?: number;
    readonly navigator?: {
        readonly permissions?: {
            query(descriptor: { name: string }): Promise<PermissionStatusLike>;
        };
    };
    getScreenDetails?(): Promise<ScreenDetails>;
}

/** Structural PermissionStatus: jsdom lacks the real one. */
export interface PermissionStatusLike {
    readonly state: 'granted' | 'prompt' | 'denied';
    addEventListener?(type: 'change', listener: () => void): void;
    removeEventListener?(type: 'change', listener: () => void): void;
}

/**
 * Host-supplied screen source (design doc §4.6). Implemented by the app —
 * e.g. over an Electron preload bridge to the main-process `screen` module —
 * with no runtime dependency in either direction. When present it replaces
 * the Window Management API entirely: no permission machinery, snapshot
 * populated eagerly, and `id` can be a genuinely stable native id
 * (Electron's `Display.id`).
 */
export interface DockviewScreenAdapter {
    /** Replaces getScreenDetails() as the source of truth. */
    getScreens(): Promise<DockviewScreen[]> | DockviewScreen[];
    /** Replaces screenschange listening. Returns an unsubscribe. */
    subscribe?(listener: (screens: DockviewScreen[]) => void): () => void;
    /**
     * Native window placement (e.g. BrowserWindow.setBounds via IPC).
     * Consumers fall back to win.moveTo/resizeTo when absent. (Consumed from
     * Phase 2 onward.)
     */
    moveWindow?(window: Window, box: Box): boolean | Promise<boolean>;
    /**
     * Native fullscreen (e.g. BrowserWindow.setFullScreen via IPC).
     * Consumers fall back to the web fullscreen path when absent. (Consumed
     * from Phase 3 onward.)
     */
    setFullscreen?(window: Window, value: boolean): boolean | Promise<boolean>;
}

export interface IScreenManager {
    /** True when the Window Management API exists on the host window. */
    readonly isSupported: boolean;
    /** Last-known snapshot; a single synthetic screen until details resolve. */
    readonly screens: readonly DockviewScreen[];
    /**
     * True once the snapshot reflects a real source (Window Management API or
     * adapter) rather than the single-screen fallback. Placement code gates
     * on this: honouring a `screen` target against the fallback would be
     * placing against made-up geometry.
     */
    readonly hasResolvedScreens: boolean;
    readonly currentScreen: DockviewScreen | undefined;
    readonly onDidChangeScreens: Event<DockviewScreensChangeEvent>;

    /** Where the permission stands; never prompts. */
    permissionState(): Promise<WindowManagementPermissionState>;
    /**
     * Resolves the true screen list. Prompts when the permission is in the
     * `prompt` state (callers must hold a user gesture); resolves to the
     * single-screen fallback when unsupported/denied.
     */
    getScreens(): Promise<DockviewScreen[]>;
    /**
     * Queries the permission (never prompting) and eagerly populates the
     * snapshot when it is already granted. Safe to call without a gesture —
     * this is what makes gesture-less paths (fromJSON restore) screen-aware.
     */
    prime(): Promise<void>;

    resolveTarget(target: DockviewScreenTarget): DockviewScreen | undefined;
    /** The screen whose full bounds contain the point, if any. */
    screenAtPoint(x: number, y: number): DockviewScreen | undefined;
    /**
     * Compute a window.open placement Box on `screen`, clamped to its work
     * area so a window can never open with its titlebar off the usable area.
     */
    placementFor(screen: DockviewScreen, placement?: ScreenPlacement): Box;

    /**
     * Move/resize a window to `box` (multi-screen coordinates) — via the
     * adapter's native placement when available, else `win.moveTo/resizeTo`
     * (cross-screen moves require the permission to be granted; the browser
     * clamps otherwise). Resolves false when the move failed or threw.
     */
    moveWindowTo(window: Window, box: Box): Promise<boolean>;

    /**
     * Enter/exit fullscreen for `window` — via the adapter's native hook
     * when available, else element fullscreen on the window's own document.
     * The web path succeeds only with transient activation IN that window
     * (activation never crosses windows), so callers must hold a gesture
     * from the window's own realm. Resolves false when the transition failed
     * or threw.
     */
    setFullscreen(window: Window, value: boolean): Promise<boolean>;

    dispose(): void;
}

const PERMISSION_NAMES = [
    'window-management',
    /** Legacy alias: older Chromium throws TypeError for the new name. */
    'window-placement',
];

function clampToWorkArea(box: Box, workArea: Box): Box {
    const width = Math.min(box.width, workArea.width);
    const height = Math.min(box.height, workArea.height);
    const maxLeft = workArea.left + workArea.width - width;
    const maxTop = workArea.top + workArea.height - height;
    return {
        left: Math.min(Math.max(box.left, workArea.left), maxLeft),
        top: Math.min(Math.max(box.top, workArea.top), maxTop),
        width,
        height,
    };
}

export class ScreenManager
    extends CompositeDisposable
    implements IScreenManager
{
    private readonly _onDidChangeScreens =
        new Emitter<DockviewScreensChangeEvent>();
    readonly onDidChangeScreens = this._onDidChangeScreens.event;

    private _screens: DockviewScreen[];
    private _details: ScreenDetails | null = null;
    private _detachDetailListeners: (() => void) | null = null;
    private _detachPermissionListener: (() => void) | null = null;
    private _detachAdapterListener: (() => void) | null = null;
    private _denied = false;
    private _hasResolvedScreens = false;

    constructor(
        private readonly _window: ScreenManagerWindow = globalThis.window as unknown as ScreenManagerWindow,
        private readonly _adapter?: DockviewScreenAdapter
    ) {
        super();
        this._screens = [this.fallbackScreen()];
        this.addDisposables(
            this._onDidChangeScreens,
            Disposable.from(() => {
                this._detachDetailListeners?.();
                this._detachDetailListeners = null;
                this._detachPermissionListener?.();
                this._detachPermissionListener = null;
                this._detachAdapterListener?.();
                this._detachAdapterListener = null;
                this._details = null;
            })
        );
    }

    get isSupported(): boolean {
        // Precedence: adapter → Window Management API → unsupported.
        return (
            this._adapter !== undefined ||
            typeof this._window?.getScreenDetails === 'function'
        );
    }

    get screens(): readonly DockviewScreen[] {
        return this._screens;
    }

    get hasResolvedScreens(): boolean {
        return this._hasResolvedScreens;
    }

    get currentScreen(): DockviewScreen | undefined {
        return this._screens.find((screen) => screen.isCurrent);
    }

    async permissionState(): Promise<WindowManagementPermissionState> {
        if (this._adapter) {
            // Adapter-fed screens involve no browser permission at all.
            return 'granted';
        }
        if (!this.isSupported) {
            return 'unsupported';
        }
        const permissions = this._window.navigator?.permissions;
        if (!permissions?.query) {
            // API present but no Permissions API to interrogate: state is
            // unknowable without prompting, which is exactly what 'prompt'
            // signals to callers.
            return 'prompt';
        }
        for (const name of PERMISSION_NAMES) {
            try {
                const status = await permissions.query({ name });
                this.watchPermission(status);
                return status.state;
            } catch {
                // TypeError for an unrecognised permission name — try the
                // legacy alias.
            }
        }
        return 'prompt';
    }

    async prime(): Promise<void> {
        if ((await this.permissionState()) === 'granted') {
            await this.getScreens();
        }
    }

    async getScreens(): Promise<DockviewScreen[]> {
        if (this._adapter) {
            if (this.isDisposed) {
                return this._screens;
            }
            try {
                const screens = await this._adapter.getScreens();
                if (this.isDisposed) {
                    return this._screens;
                }
                this.attachAdapterListener();
                if (screens.length > 0) {
                    this.updateSnapshot([...screens], true);
                }
                return this._screens;
            } catch {
                return this.useFallback();
            }
        }
        if (!this.isSupported || this._denied || this.isDisposed) {
            return this.useFallback();
        }
        try {
            if (!this._details) {
                const details = await this._window.getScreenDetails!();
                if (this.isDisposed) {
                    return this._screens;
                }
                this._details = details;
                this.attachDetailListeners(details);
            }
            this.updateSnapshot(this.mapScreens(this._details), true);
            return this._screens;
        } catch {
            // NotAllowedError: the user denied the prompt (or policy blocks
            // the API). Remember it so later calls don't re-prompt.
            this._denied = true;
            return this.useFallback();
        }
    }

    resolveTarget(target: DockviewScreenTarget): DockviewScreen | undefined {
        if (typeof target === 'number') {
            return this._screens[target];
        }
        if (target === 'primary') {
            return this._screens.find((screen) => screen.isPrimary);
        }
        if (target === 'current') {
            return this.currentScreen;
        }
        // Object: identity against the snapshot, else re-resolve by id (the
        // caller may hold a screen from a stale snapshot).
        if (this._screens.includes(target)) {
            return target;
        }
        return this._screens.find((screen) => screen.id === target.id);
    }

    screenAtPoint(x: number, y: number): DockviewScreen | undefined {
        return this._screens.find(
            (screen) =>
                x >= screen.bounds.left &&
                x < screen.bounds.left + screen.bounds.width &&
                y >= screen.bounds.top &&
                y < screen.bounds.top + screen.bounds.height
        );
    }

    placementFor(
        screen: DockviewScreen,
        placement: ScreenPlacement = { type: 'center' }
    ): Box {
        const workArea = screen.workArea;
        let box: Box;
        switch (placement.type) {
            case 'fill':
                box = { ...workArea };
                break;
            case 'box':
                box = {
                    left: workArea.left + placement.box.left,
                    top: workArea.top + placement.box.top,
                    width: placement.box.width,
                    height: placement.box.height,
                };
                break;
            case 'center': {
                const width = placement.width ?? Math.round(workArea.width / 2);
                const height =
                    placement.height ?? Math.round(workArea.height / 2);
                box = {
                    left: workArea.left + Math.round((workArea.width - width) / 2),
                    top: workArea.top + Math.round((workArea.height - height) / 2),
                    width,
                    height,
                };
                break;
            }
        }
        return clampToWorkArea(box, workArea);
    }

    private useFallback(): DockviewScreen[] {
        this.updateSnapshot([this.fallbackScreen()]);
        return this._screens;
    }

    private fallbackScreen(): DockviewScreen {
        const screen = this._window?.screen;
        // Non-standard availLeft/availTop exist in browsers but not in the
        // Screen type; harmless zeros elsewhere (e.g. jsdom).
        const availLeft =
            (screen as { availLeft?: number })?.availLeft ?? 0;
        const availTop = (screen as { availTop?: number })?.availTop ?? 0;
        return {
            id: 'dv-screen-fallback',
            label: '',
            isPrimary: true,
            isInternal: false,
            isCurrent: true,
            bounds: {
                left: 0,
                top: 0,
                width: screen?.width ?? 0,
                height: screen?.height ?? 0,
            },
            workArea: {
                left: availLeft,
                top: availTop,
                width: screen?.availWidth ?? 0,
                height: screen?.availHeight ?? 0,
            },
            devicePixelRatio: this._window?.devicePixelRatio ?? 1,
        };
    }

    private mapScreens(details: ScreenDetails): DockviewScreen[] {
        const labelCounts = new Map<string, number>();
        return details.screens.map((native, index) => {
            // Best-effort stable id: label when present (disambiguated when
            // two identical monitors share one), else positional.
            const base = native.label || `screen-${index}`;
            const seen = labelCounts.get(base) ?? 0;
            labelCounts.set(base, seen + 1);
            const id = seen === 0 ? base : `${base}#${seen}`;
            return {
                id,
                label: native.label,
                isPrimary: native.isPrimary,
                isInternal: native.isInternal,
                isCurrent: native === details.currentScreen,
                bounds: {
                    left: native.left,
                    top: native.top,
                    width: native.width,
                    height: native.height,
                },
                workArea: {
                    left: native.availLeft,
                    top: native.availTop,
                    width: native.availWidth,
                    height: native.availHeight,
                },
                devicePixelRatio: native.devicePixelRatio,
                native,
            };
        });
    }

    async moveWindowTo(window: Window, box: Box): Promise<boolean> {
        if (this._adapter?.moveWindow) {
            try {
                return (await this._adapter.moveWindow(window, box)) !== false;
            } catch {
                return false;
            }
        }
        try {
            window.moveTo(box.left, box.top);
            window.resizeTo(box.width, box.height);
            return true;
        } catch {
            return false;
        }
    }

    async setFullscreen(window: Window, value: boolean): Promise<boolean> {
        if (this._adapter?.setFullscreen) {
            try {
                return (
                    (await this._adapter.setFullscreen(window, value)) !== false
                );
            } catch {
                return false;
            }
        }
        // Web fallback: element fullscreen on the window's OWN document.
        // Transient activation never crosses windows (spike finding: a load
        // handler in a fresh popout cannot requestFullscreen), so this
        // succeeds only when driven by a gesture inside that window's realm.
        try {
            const doc = window.document;
            if (value) {
                if (!doc.fullscreenElement) {
                    await doc.documentElement.requestFullscreen();
                }
                return !!doc.fullscreenElement;
            }
            if (doc.fullscreenElement) {
                await doc.exitFullscreen();
            }
            return !doc.fullscreenElement;
        } catch {
            return false;
        }
    }

    private updateSnapshot(next: DockviewScreen[], live = false): void {
        const previous = this._screens;
        this._screens = next;
        this._hasResolvedScreens = live;

        const previousIds = new Set(previous.map((screen) => screen.id));
        const nextIds = new Set(next.map((screen) => screen.id));
        const added = next.filter((screen) => !previousIds.has(screen.id));
        const removed = previous.filter((screen) => !nextIds.has(screen.id));

        const changed = next.filter((screen) => {
            const before = previous.find((s) => s.id === screen.id);
            return (
                before !== undefined &&
                (JSON.stringify(before.bounds) !==
                    JSON.stringify(screen.bounds) ||
                    JSON.stringify(before.workArea) !==
                        JSON.stringify(screen.workArea))
            );
        });
        const currentChanged = next.some((screen) => {
            const before = previous.find((s) => s.id === screen.id);
            return before !== undefined && before.isCurrent !== screen.isCurrent;
        });

        if (added.length || removed.length || changed.length || currentChanged) {
            this._onDidChangeScreens.fire({
                screens: next,
                added,
                removed,
                changed,
            });
        }
    }

    private attachDetailListeners(details: ScreenDetails): void {
        const refresh = (): void => {
            if (this.isDisposed || !this._details) {
                return;
            }
            this.updateSnapshot(this.mapScreens(this._details), true);
        };
        details.addEventListener('screenschange', refresh);
        details.addEventListener('currentscreenchange', refresh);
        this._detachDetailListeners = () => {
            details.removeEventListener('screenschange', refresh);
            details.removeEventListener('currentscreenchange', refresh);
        };
    }

    private attachAdapterListener(): void {
        if (this._detachAdapterListener || !this._adapter?.subscribe) {
            return;
        }
        this._detachAdapterListener = this._adapter.subscribe((screens) => {
            if (this.isDisposed || screens.length === 0) {
                return;
            }
            this.updateSnapshot([...screens], true);
        });
    }

    private watchPermission(status: PermissionStatusLike): void {
        if (this._detachPermissionListener || !status.addEventListener) {
            return;
        }
        const onChange = (): void => {
            if (this.isDisposed) {
                return;
            }
            if (status.state === 'granted') {
                // A grant landed (possibly from another tab / settings UI):
                // safe to resolve details now, no prompt involved.
                this._denied = false;
                void this.getScreens();
            } else if (status.state === 'denied') {
                this._denied = true;
                this._details = null;
                this._detachDetailListeners?.();
                this._detachDetailListeners = null;
                this.useFallback();
            }
        };
        status.addEventListener('change', onChange);
        this._detachPermissionListener = () => {
            status.removeEventListener?.('change', onChange);
        };
    }
}

/**
 * Narrow host surface the module needs. Structural — an options bag that MAY
 * carry a `screenAdapter`, plus the popout window handles for topology
 * rehoming.
 */
export interface IScreenManagerHost {
    readonly options: { readonly screenAdapter?: DockviewScreenAdapter };
    /** The live popout window handles (topology rehoming, design §4.4). */
    getPopoutWindows?(): Window[];
}

export const ScreenManagerModule = defineModule<
    'screenManagerService',
    IScreenManagerHost
>({
    name: 'ScreenManagement',
    serviceKey: 'screenManagerService',
    options: ['screenAdapter'],
    create: (host) => new ScreenManager(undefined, host.options.screenAdapter),
    init: (host, service) => {
        // Query-only permission probe; populates the snapshot eagerly when
        // the permission is already granted (or an adapter is present) so
        // gesture-less paths (fromJSON restore) are screen-aware. Never
        // prompts.
        void service.prime();

        // Topology resilience (design §4.4): a popout on an unplugged
        // monitor would otherwise be lost off-screen. Membership is computed
        // geometrically from the window's centre against the snapshot —
        // `currentscreenchange` can't be used, it tracks only the window
        // that called getScreenDetails().
        return service.onDidChangeScreens((event) => {
            if (!service.hasResolvedScreens) {
                return;
            }
            for (const win of host.getPopoutWindows?.() ?? []) {
                if (!win || win.closed) {
                    continue;
                }
                try {
                    // A fullscreen popout intentionally covers full screen
                    // bounds; clamping it to a work area would be wrong.
                    if (win.document?.fullscreenElement) {
                        continue;
                    }
                } catch {
                    continue;
                }
                const rect = {
                    left: win.screenX,
                    top: win.screenY,
                    width: win.innerWidth,
                    height: win.innerHeight,
                };
                const screen = service.screenAtPoint(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2
                );
                if (!screen) {
                    // The window's screen is gone (or it sits in dead space):
                    // re-place it onto the current/primary screen at its size.
                    const target =
                        service.resolveTarget('current') ??
                        service.resolveTarget('primary') ??
                        service.screens[0];
                    if (!target) {
                        continue;
                    }
                    void service.moveWindowTo(
                        win,
                        service.placementFor(target, {
                            type: 'center',
                            width: rect.width || undefined,
                            height: rect.height || undefined,
                        })
                    );
                } else if (event.changed.some((c) => c.id === screen.id)) {
                    // The window's own screen changed geometry: clamp into
                    // its new work area. Only screens from `changed` are
                    // touched so unrelated topology events (a monitor added
                    // elsewhere) never yank deliberately-placed windows.
                    const wa = screen.workArea;
                    const width = Math.min(rect.width, wa.width);
                    const height = Math.min(rect.height, wa.height);
                    const left = Math.min(
                        Math.max(rect.left, wa.left),
                        wa.left + wa.width - width
                    );
                    const top = Math.min(
                        Math.max(rect.top, wa.top),
                        wa.top + wa.height - height
                    );
                    if (
                        left !== rect.left ||
                        top !== rect.top ||
                        width !== rect.width ||
                        height !== rect.height
                    ) {
                        void service.moveWindowTo(win, {
                            left,
                            top,
                            width,
                            height,
                        });
                    }
                }
            }
        });
    },
});
