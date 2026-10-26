import 'dockview/dist/styles/dockview.css';
import './styles.css';

// Importing the enterprise package registers its feature modules for every
// dockview instance in this webview.
import 'dockview-enterprise';

import { createDockview, type IContentRenderer, themeAbyss } from 'dockview';
import { installAutotest } from './autotest';
import { closeNativePopout } from './bridge';
import { resolveDndStrategy } from './dnd';
import {
    CrossWindowDragPanel,
    HistoryPanel,
    HostPanel,
    LayoutSyncPanel,
    NativeWindowPanel,
    PopoutPanel,
    ScratchPanel,
    WorkspacePanel,
} from './panels';
import { installShellMultiWindow, type ShellMultiWindow } from './transport';

/** `randomUUID` needs a secure context, which `tauri://localhost` need not be. */
function randomId(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('');
}

// Panels are built during the restore, before the install returns.
let resolveMultiWindow: (shell: ShellMultiWindow) => void = () => undefined;
const multiWindow = new Promise<ShellMultiWindow>((resolve) => {
    resolveMultiWindow = resolve;
});

const renderers: Record<string, () => IContentRenderer> = {
    host: () => new HostPanel(),
    popout: () => new PopoutPanel(),
    native: () => new NativeWindowPanel(),
    sync: () => new LayoutSyncPanel(),
    crossWindowDrag: () => new CrossWindowDragPanel(multiWindow),
    workspace: () => new WorkspacePanel(),
    history: () => new HistoryPanel(multiWindow),
    scratch: () => new ScratchPanel(),
};

const container = document.getElementById('app');

if (!container) {
    throw new Error('missing #app container');
}

const dndStrategy = resolveDndStrategy();

const api = createDockview(container, {
    theme: themeAbyss,
    dndStrategy,
    // Default group ids collide when a group moves between windows.
    groupIdGenerator: randomId,
    layoutHistory: {
        enabled: true,
        clearOnFromJSON: false,
        recordResize: false,
    },
    createComponent: (options) =>
        renderers[options.name]?.() ?? new ScratchPanel(),
});

void installShellMultiWindow(api, { buildDefaults }).then((shell) => {
    resolveMultiWindow(shell);
    installAutotest(api, shell);
});

/**
 * wry's macOS UI delegate has no `webViewDidClose:`, so the `close()` dockview
 * calls on a popout window does nothing there and the shell has to destroy it.
 * One listener covers every popout this instance opens; the simulation's
 * throwaway instance registers its own.
 */
api.onWillClosePopoutWindow(({ window }) => {
    void closeNativePopout(window);
});

const width = (fraction: number) =>
    Math.round(container.clientWidth * fraction);
const height = (fraction: number) =>
    Math.round(container.clientHeight * fraction);

/** Panel ids are unique across windows: all but main suffix their label. */
function buildDefaults(label: string): void {
    const id = (name: string) =>
        label === 'main' || label === 'browser' ? name : `${name}-${label}`;

    api.addPanel({ id: id('host'), component: 'host', title: 'Host' });

    api.addPanel({
        id: id('popout'),
        component: 'popout',
        title: 'Popouts',
        position: { referencePanel: id('host'), direction: 'right' },
        initialWidth: width(0.62),
    });

    api.addPanel({
        id: id('native'),
        component: 'native',
        title: 'Native windows',
        position: { referencePanel: id('popout'), direction: 'below' },
        initialHeight: height(0.45),
    });

    api.addPanel({
        id: id('sync'),
        component: 'sync',
        title: 'Layout sync',
        position: { referencePanel: id('native'), direction: 'within' },
        inactive: true,
    });

    api.addPanel({
        id: id('crossWindowDrag'),
        component: 'crossWindowDrag',
        title: 'Cross-window drag',
        position: { referencePanel: id('native'), direction: 'within' },
        inactive: true,
    });

    api.addPanel({
        id: id('workspace'),
        component: 'workspace',
        title: 'Workspace',
        position: { referencePanel: id('native'), direction: 'within' },
        inactive: true,
    });

    api.addPanel({
        id: id('history'),
        component: 'history',
        title: 'Undo',
        position: { referencePanel: id('native'), direction: 'within' },
        inactive: true,
    });

    api.addPanel({
        id: id('scratch'),
        component: 'scratch',
        title: 'Scratch',
        position: { referencePanel: id('host'), direction: 'below' },
        initialHeight: height(0.3),
    });
}
