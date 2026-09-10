import 'dockview/dist/styles/dockview.css';
import './styles.css';

// Importing the enterprise package registers its feature modules for every
// dockview instance in this webview.
import 'dockview-enterprise';

import { type IContentRenderer, createDockview, themeAbyss } from 'dockview';
import {
    HostPanel,
    LayoutSyncPanel,
    NativeWindowPanel,
    PopoutPanel,
    ScratchPanel,
} from './panels';

const renderers: Record<string, () => IContentRenderer> = {
    host: () => new HostPanel(),
    popout: () => new PopoutPanel(),
    native: () => new NativeWindowPanel(),
    sync: () => new LayoutSyncPanel(),
    scratch: () => new ScratchPanel(),
};

const container = document.getElementById('app');

if (!container) {
    throw new Error('missing #app container');
}

const api = createDockview(container, {
    theme: themeAbyss,
    createComponent: (options) =>
        renderers[options.name]?.() ?? new ScratchPanel(),
});

// The grid is measured by a ResizeObserver, which has not fired yet. Seed it
// with the container's size so the panels below split proportionally instead
// of collapsing to their minimum width.
api.layout(container.clientWidth, container.clientHeight);

const width = (fraction: number) =>
    Math.round(container.clientWidth * fraction);
const height = (fraction: number) =>
    Math.round(container.clientHeight * fraction);

api.addPanel({ id: 'host', component: 'host', title: 'Host' });

api.addPanel({
    id: 'popout',
    component: 'popout',
    title: 'Popouts',
    position: { referencePanel: 'host', direction: 'right' },
    initialWidth: width(0.62),
});

api.addPanel({
    id: 'native',
    component: 'native',
    title: 'Native windows',
    position: { referencePanel: 'popout', direction: 'below' },
    initialHeight: height(0.45),
});

api.addPanel({
    id: 'sync',
    component: 'sync',
    title: 'Layout sync',
    position: { referencePanel: 'native', direction: 'within' },
    inactive: true,
});

api.addPanel({
    id: 'scratch',
    component: 'scratch',
    title: 'Scratch',
    position: { referencePanel: 'host', direction: 'below' },
    initialHeight: height(0.3),
});
