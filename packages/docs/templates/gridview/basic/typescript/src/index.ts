import 'dockview/dist/styles/dockview.css';
import {
    createGridview,
    IFrameworkPart,
    GridviewPanel,
    themeAbyss,
    Orientation,
} from 'dockview';

class Panel extends GridviewPanel {
    private readonly _frameworkPart: IFrameworkPart;

    constructor(id: string, component: string) {
        super(id, component);

        this.element.style.color = 'white';
        this.element.style.padding = '10px';
        this.element.style.background = '#1e1e1e';
        this.element.style.border = '1px solid #333';
        this.element.style.height = '100%';

        this._frameworkPart = {
            update: (parameters) => {
                this.element.textContent = `Panel ${parameters?.id || id}`;
            },
            dispose: () => {
                // cleanup if needed
            },
        };

        this.api.initialize(this);
    }

    getComponent(): IFrameworkPart {
        return this._frameworkPart;
    }
}

const container = document.getElementById('app');
if (!container) {
    throw new Error('Container element #app not found');
}

const api = createGridview(container, {
    className: themeAbyss.className,
    orientation: Orientation.HORIZONTAL,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel(options.id, options.name);
            default:
                throw new Error(`Unsupported component: ${options.name}`);
        }
    },
});

const panel1 = api.addPanel({
    id: 'panel_1',
    component: 'default',
});

const panel2 = api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: { referencePanel: panel1.id, direction: 'right' },
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    position: { referencePanel: panel1.id, direction: 'below' },
});

api.addPanel({
    id: 'panel_4',
    component: 'default',
    position: { referencePanel: panel2.id, direction: 'below' },
});
