import type {
    DockviewApi,
    DockviewGroupPanel,
    GroupPanelPartInitParameters,
    IContentRenderer,
    SerializedDockview,
} from 'dockview';
import {
    broadcastLayout,
    nativeHostInfo,
    onLayoutBroadcast,
    openNativeWindow,
    windowLabel,
} from './bridge';
import { resolveDndStrategy } from './dnd';
import { LogView, button, el, field, verdict } from './dom';
import { diagnosePopoutUrl, readHostReport } from './host';
import { describe, probeWindowOpen } from './probes';
import { RELEASE_ORIGIN_URL, simulateReleaseOriginRestore } from './simulate';

abstract class DemoPanel implements IContentRenderer {
    protected readonly root = el('div', { class: 'demo-panel' });
    private readonly teardown: (() => void)[] = [];

    get element(): HTMLElement {
        return this.root;
    }

    abstract init(parameters: GroupPanelPartInitParameters): void;

    protected onDispose(fn: () => void): void {
        this.teardown.push(fn);
    }

    dispose(): void {
        for (const fn of this.teardown.splice(0)) {
            fn();
        }
    }
}

function section(title: string, ...children: (Node | string)[]): HTMLElement {
    return el(
        'section',
        { class: 'demo-section' },
        el('h2', { class: 'demo-heading' }, title),
        ...children
    );
}

/** What the page thinks it is running inside. */
export class HostPanel extends DemoPanel {
    init(parameters: GroupPanelPartInitParameters): void {
        const body = el('div');
        const api = parameters.containerApi;
        const requested = resolveDndStrategy();

        // Live, because the interesting moment is mid-drag: a pointer drag
        // that selects the text it crosses cannot be measured by anything
        // that needs a click to refresh, since the click clears the
        // selection. `peak` keeps the high-water mark for the same reason.
        let peak = 0;
        let shieldSeen = false;
        let overlayEvents = 0;
        let renderedOverlayEvents = 0;
        let selectStarts = 0;
        let selectStartsPrevented = 0;
        const selection = el('div', { class: 'demo-diag' });

        const renderSelection = () => {
            const length = globalThis.getSelection()?.toString().length ?? 0;
            peak = Math.max(peak, length);
            const caps = api.dndCapabilities;
            selection.replaceChildren(
                field(
                    'dnd backend',
                    `${requested} → ${
                        [
                            caps.html5 && 'html5',
                            caps.pointer &&
                                (caps.pointerHandlesMouse
                                    ? 'pointer (incl. mouse)'
                                    : 'pointer (touch/pen)'),
                        ]
                            .filter(Boolean)
                            .join(' + ') || 'none'
                    }`
                ),
                field('drop overlay events', String(overlayEvents)),
                field('selected chars', `${length} (peak ${peak})`),
                field('shield seen active', shieldSeen ? 'yes' : 'no'),
                field(
                    'selectstart seen / blocked',
                    `${selectStarts} / ${selectStartsPrevented}`
                )
            );
        };

        // A drop overlay means the drag reached dockview: on the HTML5 backend
        // that is the page receiving `dragover`, which is what a host can break.
        const overlays = api.onWillShowOverlay(() => {
            overlayEvents += 1;
        });
        this.onDispose(() => overlays.dispose());

        // The shield is a `user-select` applied and released inside one drag, so
        // it is sampled. Rendering the overlay count here too keeps a
        // dragover-rate event off the render path.
        const sample = setInterval(() => {
            const applied =
                document.documentElement.style.getPropertyValue(
                    'user-select'
                ) === 'none';
            if (applied && !shieldSeen) {
                shieldSeen = true;
                renderSelection();
            }
            if (overlayEvents !== renderedOverlayEvents) {
                renderedOverlayEvents = overlayEvents;
                renderSelection();
            }
        }, 50);

        // Capture phase, so it runs before the shield's own handler and can
        // tell whether the event arrived at all separately from whether
        // anything cancelled it.
        const onSelectStart = (event: Event) => {
            selectStarts += 1;
            queueMicrotask(() => {
                if (event.defaultPrevented) {
                    selectStartsPrevented += 1;
                }
                renderSelection();
            });
        };
        document.addEventListener('selectstart', onSelectStart, true);

        renderSelection();
        document.addEventListener('selectionchange', renderSelection);
        this.onDispose(() => {
            clearInterval(sample);
            document.removeEventListener('selectstart', onSelectStart, true);
            document.removeEventListener('selectionchange', renderSelection);
        });
        const render = () => {
            const report = readHostReport();
            body.replaceChildren(
                field('runtime', report.runtime),
                field('engine', report.engine),
                field('origin', report.origin),
                field('protocol', report.protocol),
                field('secure context', String(report.secureContext)),
                field('user agent', report.userAgent),
                verdict(
                    report.popout.supported,
                    report.popout.supported
                        ? `Popouts allowed here — ${report.popout.reason}.`
                        : `Popouts refused here — ${report.popout.reason}.`
                )
            );
        };

        render();

        this.root.append(
            section(
                'Host environment',
                body,
                selection,
                button('Re-read', render),
                el(
                    'p',
                    { class: 'demo-note' },
                    'Under "tauri dev" the webview loads the Vite dev server over http, so this reads the same as a browser. A release build is where the host and the browser diverge.'
                )
            )
        );
    }
}

/** Whether the popout mechanism itself works in this host. */
export class PopoutPanel extends DemoPanel {
    init(parameters: GroupPanelPartInitParameters): void {
        const log = new LogView();
        const api = parameters.containerApi;
        const group = parameters.api.group;

        this.root.append(
            section(
                'Popout groups',
                el(
                    'p',
                    { class: 'demo-note' },
                    'A popout group opens a second window and moves the group’s DOM into it. That needs a same-origin URL and a script-accessible document.'
                ),
                el(
                    'div',
                    { class: 'demo-buttons' },
                    button('Check the popout URL', () => {
                        const result = diagnosePopoutUrl();
                        log.append(
                            `${result.supported ? 'allowed' : 'refused'}: ${result.url} — ${result.reason}`
                        );
                    }),
                    button('Probe window.open', () => {
                        const result = probeWindowOpen();
                        log.append(`${result.title} — ${result.detail}`);
                    }),
                    button('Pop out this group', () => {
                        popOut(api, group, log);
                    })
                ),
                el(
                    'p',
                    { class: 'demo-note' },
                    'A popout aimed at another origin is refused. These reproduce that from any origin, by aiming a popout at the origin a macOS or Linux release build serves from.'
                ),
                el(
                    'div',
                    { class: 'demo-buttons' },
                    button('Pop out on a refused origin', () => {
                        popOut(api, group, log, RELEASE_ORIGIN_URL);
                    }),
                    button('Restore a layout on a refused origin', () => {
                        runRestoreSimulation(log);
                    })
                ),
                log.element
            )
        );
    }
}

/**
 * Runs the saved-layout reproduction and reports whether any group came back
 * registered but unrendered.
 */
function runRestoreSimulation(log: LogView): void {
    log.append('simulating a restore on a refused origin…');

    simulateReleaseOriginRestore().then(
        (result) => {
            for (const step of result.steps) {
                log.append(step);
            }
            log.append(
                `groups=${result.groups} orphaned=${result.orphanedGroups} panels=${result.panels} tabs=${result.visibleTabs}`
            );
            log.append(
                result.orphanedGroups === 0 &&
                    result.visibleTabs === result.panels
                    ? 'every panel came back visible in the grid'
                    : 'a group came back registered but rendering nowhere'
            );
        },
        (err: unknown) => log.append(`simulation failed — ${describe(err)}`)
    );
}

function popOut(
    api: DockviewApi,
    group: DockviewGroupPanel,
    log: LogView,
    popoutUrl?: string
): void {
    api.addPopoutGroup(group, popoutUrl ? { popoutUrl } : undefined).then(
        (opened) => {
            log.append(
                opened
                    ? 'popout group opened'
                    : 'addPopoutGroup resolved false — the host refused the window'
            );
        },
        (err: unknown) => {
            log.append(`addPopoutGroup rejected — ${describe(err)}`);
        }
    );
}

/**
 * Native windows are the isolation boundary: a second Tauri webview runs its
 * own JavaScript context, so nothing can be moved into it from here.
 */
export class NativeWindowPanel extends DemoPanel {
    init(): void {
        const log = new LogView();
        const info = el('div');
        let counter = 0;

        const load = async () => {
            const [label, native] = await Promise.all([
                windowLabel(),
                nativeHostInfo(),
            ]);

            info.replaceChildren(
                field('window label', label),
                ...(native
                    ? [
                          field('tauri', native.tauriVersion),
                          field('webview', native.webviewVersion),
                          field(
                              'platform',
                              `${native.platform} (${native.arch})`
                          ),
                          field(
                              'release origin is http(s)',
                              String(native.httpOrigin)
                          ),
                      ]
                    : [field('shell', 'not running under Tauri')])
            );
        };

        void load().catch((err: unknown) => {
            log.append(`host_info failed — ${describe(err)}`);
        });

        this.root.append(
            section(
                'Native windows',
                info,
                el(
                    'div',
                    { class: 'demo-buttons' },
                    button('Open a second native window', () => {
                        counter += 1;
                        const label = `dock-${Date.now()}-${counter}`;
                        openNativeWindow(label).then(
                            () => log.append(`opened native window ${label}`),
                            (err: unknown) =>
                                log.append(
                                    `could not open ${label} — ${describe(err)}`
                                )
                        );
                    })
                ),
                el(
                    'p',
                    { class: 'demo-note' },
                    'The second window runs a separate webview with its own dockview instance. Panels cannot be dragged between the two — share layout state over IPC instead.'
                ),
                log.element
            )
        );
    }
}

/** Moves layout state, rather than DOM, across the process boundary. */
export class LayoutSyncPanel extends DemoPanel {
    init(parameters: GroupPanelPartInitParameters): void {
        const log = new LogView();
        const api = parameters.containerApi;
        let label = 'browser';

        void windowLabel().then((value) => {
            label = value;
        });

        void onLayoutBroadcast((payload) => {
            if (payload.from === label) {
                return;
            }

            try {
                api.fromJSON(payload.layout as SerializedDockview);
                log.append(`applied layout from ${payload.from}`);
            } catch (err: unknown) {
                log.append(`could not apply layout — ${describe(err)}`);
            }
        }).then((unlisten) => {
            this.onDispose(unlisten);
        });

        this.root.append(
            section(
                'Cross-window layout sync',
                el(
                    'p',
                    { class: 'demo-note' },
                    'Serialized layout travels over Tauri’s event bus, so every native window can converge on the same arrangement without sharing a DOM.'
                ),
                el(
                    'div',
                    { class: 'demo-buttons' },
                    button('Broadcast this layout', () => {
                        broadcastLayout(label, api.toJSON()).then(
                            () => log.append('layout broadcast'),
                            (err: unknown) =>
                                log.append(
                                    `broadcast failed — ${describe(err)}`
                                )
                        );
                    })
                ),
                log.element
            )
        );
    }
}

/** Plain content, so the layout has something ordinary to dock around. */
export class ScratchPanel extends DemoPanel {
    init(): void {
        this.root.append(
            section(
                'Scratch panel',
                el(
                    'p',
                    { class: 'demo-note' },
                    'Drag, split and float this panel to exercise the enterprise features the demo pulls in.'
                )
            )
        );
    }
}
