import 'dockview/dist/styles/dockview.css';
import {
    createSplitview,
    SplitviewPanel,
    IFrameworkPart,
    themeAbyss,
} from 'dockview';

const PANEL_COLORS = ['#1e1e1e', '#252526', '#2d2d30'];

class Panel extends SplitviewPanel {
    private readonly _frameworkPart: IFrameworkPart;

    constructor(id: string, component: string, colorIndex: number) {
        super(id, component);

        this.element.style.color = 'white';
        this.element.style.padding = '10px';
        this.element.style.background = PANEL_COLORS[colorIndex % PANEL_COLORS.length];

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

let panelCount = 0;
const container = document.getElementById('app');
if (!container) {
    throw new Error('Container element #app not found');
}

const api = createSplitview(container, {
    className: themeAbyss.className,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel(options.id, options.name, panelCount++);
            default:
                throw new Error(`Unsupported component: ${options.name}`);
        }
    },
});

api.addPanel({
    id: 'panel_1',
    component: 'default',
    size: 200,
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    size: 300,
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    size: 200,
});
