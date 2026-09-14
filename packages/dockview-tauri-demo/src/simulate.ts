/**
 * Reproduces, inside an ordinary browser, what dockview does when the page is
 * served from an origin its popout guard refuses — the situation a packaged
 * desktop shell creates on macOS and Linux, where the app is served from
 * `tauri://localhost` rather than over http(s).
 *
 * The guard resolves the popout URL against the page, so pointing a popout at
 * a `tauri://` URL fails at exactly the same check, from any origin. That makes
 * the release-build behaviour reproducible without packaging anything.
 */

import {
    type DockviewApi,
    type IContentRenderer,
    createDockview,
    themeAbyss,
} from 'dockview';

/** A popout target on the origin a macOS / Linux release build would use. */
export const RELEASE_ORIGIN_URL = 'tauri://localhost/popout.html';

export interface SimulationResult {
    steps: string[];
    groups: number;
    /** Groups the component knows about but which render nowhere. */
    orphanedGroups: number;
    panels: number;
    visibleTabs: number;
}

class StubPanel implements IContentRenderer {
    readonly element = document.createElement('div');

    init(): void {
        this.element.textContent = 'stub';
    }
}

function offscreenHost(): HTMLElement {
    const host = document.createElement('div');
    host.setAttribute(
        'style',
        'position:fixed;left:-10000px;top:0;width:800px;height:600px'
    );
    document.body.appendChild(host);
    return host;
}

const settle = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * Saves a layout containing a popout group, reopens it with the popout pointed
 * at a refused origin, and reports what survived. Runs against a throwaway
 * dockview instance so the demo's own layout is untouched.
 */
export async function simulateReleaseOriginRestore(): Promise<SimulationResult> {
    const steps: string[] = [];
    const host = offscreenHost();
    let api: DockviewApi | undefined;

    try {
        api = createDockview(host, {
            theme: themeAbyss,
            createComponent: () => new StubPanel(),
        });
        api.layout(host.clientWidth, host.clientHeight);
        api.addPanel({ id: 'a', component: 'stub', title: 'A' });
        api.addPanel({
            id: 'b',
            component: 'stub',
            title: 'B',
            position: { referencePanel: 'a', direction: 'right' },
        });

        const target = api.getPanel('b')?.group;
        if (!target) {
            throw new Error('could not resolve the group to pop out');
        }

        // An explicit URL so it survives into the saved layout; the
        // '/popout.html' default is applied when opening, not serialized.
        const opened = await api.addPopoutGroup(target, {
            popoutUrl: '/popout.html',
        });
        steps.push(`popped B out into its own window: ${opened}`);

        const saved = api.toJSON();
        const popouts = saved.popoutGroups ?? [];
        for (const popout of popouts) {
            popout.url = RELEASE_ORIGIN_URL;
        }
        steps.push(
            `saved the layout and repointed ${popouts.length} popout(s) at ${RELEASE_ORIGIN_URL}`
        );

        api.clear();
        api.fromJSON(saved);
        await settle(800);
        steps.push('restored the layout on the refused origin');

        const orphaned = api.groups.filter(
            (group) => !host.contains(group.element)
        );

        return {
            steps,
            groups: api.groups.length,
            orphanedGroups: orphaned.length,
            panels: api.panels.length,
            visibleTabs: host.querySelectorAll('.dv-tab').length,
        };
    } finally {
        api?.dispose();
        host.remove();
    }
}
