import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    DockviewGroupPanel,
    DockviewPanelApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    IGroupHeaderProps,
    IHeaderActionsRenderer,
    IWatermarkRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

const STORAGE_KEY = 'floating.layout';

const MENU_ITEMS = [
    'New tab',
    'Duplicate panel',
    'Rename panel',
    'Close panel',
];

// A show/hide popover menu, closing when clicking outside. The active document
// is provided lazily so the outside-click handler follows the panel's window
// when the group is popped out.
class PopoverMenu {
    private readonly _element: HTMLElement;
    private readonly _button: HTMLButtonElement;
    private readonly _label: Text;
    private readonly _menu: HTMLUListElement;
    private _open = false;
    private _outsideHandler?: (event: Event) => void;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(private readonly getWindow: () => Window) {
        this._element = document.createElement('span');

        this._button = document.createElement('button');
        this._button.style.position = 'relative';
        this._button.style.alignSelf = 'flex-start';
        this._label = document.createTextNode('Show menu');
        this._button.appendChild(this._label);

        this._menu = this.createMenu();
        this._menu.style.display = 'none';
        this._button.appendChild(this._menu);

        this._button.addEventListener('click', () => this.toggle());
        this._element.appendChild(this._button);
    }

    private createMenu(): HTMLUListElement {
        const menu = document.createElement('ul');
        Object.assign(menu.style, {
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '0',
            background: 'var(--dv-group-view-background-color)',
            color: 'var(--dv-activegroup-visiblepanel-tab-color)',
            border: '1px solid var(--dv-separator-border)',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
            listStyle: 'none',
            padding: '4px 0',
            margin: '0',
            minWidth: '160px',
            textAlign: 'left',
            zIndex: '1000',
        } as Partial<CSSStyleDeclaration>);

        for (const label of MENU_ITEMS) {
            const item = document.createElement('li');
            item.style.padding = '6px 16px';
            item.style.cursor = 'pointer';
            item.textContent = label;
            item.addEventListener(
                'mouseenter',
                () =>
                    (item.style.background =
                        'var(--dv-activegroup-visiblepanel-tab-background-color)')
            );
            item.addEventListener(
                'mouseleave',
                () => (item.style.background = 'transparent')
            );
            menu.appendChild(item);
        }

        return menu;
    }

    private toggle(): void {
        this._open ? this.close() : this.open();
    }

    private open(): void {
        this._open = true;
        this._label.textContent = 'Hide menu';
        this._menu.style.display = '';

        const doc = this.getWindow()?.document ?? document;
        this._outsideHandler = (event: Event) => {
            if (!this._button.contains(event.target as Node)) {
                this.close();
            }
        };
        doc.addEventListener('mousedown', this._outsideHandler);
    }

    close(): void {
        if (!this._open) {
            return;
        }
        this._open = false;
        this._label.textContent = 'Show menu';
        this._menu.style.display = 'none';

        if (this._outsideHandler) {
            const doc = this.getWindow()?.document ?? document;
            doc.removeEventListener('mousedown', this._outsideHandler);
            this._outsideHandler = undefined;
        }
    }
}

class Panel implements IContentRenderer {
    private readonly _element: HTMLElement;
    private readonly _disposables: (() => void)[] = [];
    private _window!: Window;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.style.display = 'flex';
        this._element.style.flexDirection = 'column';
        this._element.style.gap = '8px';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        const api: DockviewPanelApi = parameters.api;

        this._window = api.getWindow();
        const locationDisposable = api.onDidLocationChange(() => {
            this._window = api.getWindow();
        });
        this._disposables.push(() => locationDisposable.dispose());

        const title = document.createElement('div');
        title.textContent = api.title ?? '';
        const titleDisposable = api.onDidTitleChange(() => {
            title.textContent = api.title ?? '';
        });
        this._disposables.push(() => titleDisposable.dispose());

        const popover = new PopoverMenu(() => this._window);

        this._element.append(title, popover.element);
    }

    dispose(): void {
        this._disposables.forEach((dispose) => dispose());
    }
}

class Watermark implements IWatermarkRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.style.padding = '8px';
        this._element.textContent = 'Empty group';
    }

    init(): void {
        //
    }
}

// Renders a single clickable material-symbols icon, mirroring the React `Icon`.
function createIcon(
    icon: string,
    title: string,
    onClick: () => void
): HTMLElement {
    const container = document.createElement('div');
    container.title = title;
    container.style.height = '100%';
    container.style.padding = '0px 4px';

    const button = document.createElement('div');
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    button.style.width = '30px';
    button.style.height = '100%';
    button.style.fontSize = '18px';

    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.style.fontSize = 'inherit';
    span.style.cursor = 'pointer';
    span.textContent = icon;

    button.appendChild(span);
    button.addEventListener('click', onClick);
    container.appendChild(button);

    return container;
}

let panelCount = 0;

// Left header action: add a new panel to the group.
class LeftHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement = document.createElement('div');

    get element(): HTMLElement {
        return this._element;
    }

    init(parameters: IGroupHeaderProps): void {
        const icon = createIcon('add', 'Add panel', () => {
            parameters.containerApi.addPanel({
                id: (++panelCount).toString(),
                title: `Tab ${panelCount}`,
                component: 'default',
                position: { referenceGroup: parameters.group.id },
            });
        });
        this._element.appendChild(icon);
    }

    dispose(): void {
        //
    }
}

// Right header action: pop the group out into its own window, or redock it.
class RightHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement = document.createElement('div');
    private readonly _disposables: (() => void)[] = [];

    get element(): HTMLElement {
        return this._element;
    }

    init(parameters: IGroupHeaderProps): void {
        const render = () => {
            const popout = parameters.api.location.type === 'popout';
            this._element.innerHTML = '';
            const icon = createIcon(
                popout ? 'jump_to_element' : 'back_to_tab',
                popout
                    ? 'Return group to dock'
                    : 'Open group in new window',
                () => {
                    if (parameters.api.location.type === 'popout') {
                        const group = parameters.containerApi.addGroup();
                        parameters.group.api.moveTo({ group });
                    } else {
                        parameters.containerApi.addPopoutGroup(
                            parameters.group as DockviewGroupPanel,
                            {
                                popoutUrl: '/popout/index.html',
                            }
                        );
                    }
                }
            );
            this._element.appendChild(icon);
        };

        render();

        const disposable = parameters.group.api.onDidLocationChange(() =>
            render()
        );
        this._disposables.push(() => disposable.dispose());
    }

    dispose(): void {
        this._disposables.forEach((dispose) => dispose());
    }
}

function loadDefaultLayout(api: DockviewApi): void {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
        title: 'Panel 1',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
        title: 'Panel 2',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
        title: 'Panel 3',
        position: { direction: 'right' },
    });
}

function load(api: DockviewApi): void {
    api.clear();
    const layoutString = localStorage.getItem(STORAGE_KEY);
    if (layoutString) {
        try {
            api.fromJSON(JSON.parse(layoutString));
        } catch (err) {
            console.error(err);
            api.clear();
            loadDefaultLayout(api);
        }
    } else {
        loadDefaultLayout(api);
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const toolbar = document.createElement('div');
toolbar.className = 'example-controls';

const saveButton = document.createElement('button');
saveButton.textContent = 'Save';
const loadButton = document.createElement('button');
loadButton.textContent = 'Load';
const clearButton = document.createElement('button');
clearButton.textContent = 'Clear';
toolbar.append(saveButton, loadButton, clearButton);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(toolbar, dockElement);

const api: DockviewApi = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    createWatermarkComponent: () => new Watermark(),
    createLeftHeaderActionComponent: () => new LeftHeaderActions(),
    createRightHeaderActionComponent: () => new RightHeaderActions(),
});

load(api);

saveButton.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
});

loadButton.addEventListener('click', () => {
    load(api);
});

clearButton.addEventListener('click', () => {
    api.clear();
    localStorage.removeItem(STORAGE_KEY);
});
