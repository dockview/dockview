import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

const TEXT =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

class FixedHeightContainer implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.style.height = '100%';
        this._element.textContent = [TEXT, '\n\n'].join('').repeat(20);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //
    }
}

class OverflowContainer implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.style.height = '2000px';
        this._element.style.overflow = 'auto';
        this._element.textContent = [TEXT, '\n\n'].join('').repeat(20);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //
    }
}

class UserDefinedOverflowContainer implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.style.height = '100%';

        const innerEl = document.createElement('div');
        innerEl.style.height = '100%';
        innerEl.style.overflow = 'auto';

        innerEl.textContent = [TEXT, '\n\n'].join('').repeat(20);
        this._element.appendChild(innerEl);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //
    }
}

const api = createDockview(document.getElementById('app'), {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'fixedHeightContainer':
                return new FixedHeightContainer();
            case 'overflowContainer':
                return new OverflowContainer();
            case 'userDefinedOverflowContainer':
                return new UserDefinedOverflowContainer();
        }
    },
});

api.addPanel({
    id: 'panel_1',
    component: 'fixedHeightContainer',
    title: 'Panel 1',
});

api.addPanel({
    id: 'panel_2',
    component: 'overflowContainer',
    title: 'Panel 2',
    position: { direction: 'right' },
});

api.addPanel({
    id: 'panel_3',
    component: 'userDefinedOverflowContainer',
    title: 'Panel 3',
    position: { direction: 'right' },
});
