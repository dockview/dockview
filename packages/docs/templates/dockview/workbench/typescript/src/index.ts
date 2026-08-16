import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GridviewPanel,
    IContentRenderer,
    IFrameworkPart,
    GroupPanelPartInitParameters,
    themeAbyss,
    themeLight,
    WorkbenchApi,
} from 'dockview';

// A handle the header buttons use to drive the workbench after it is ready.
let workbench: WorkbenchApi | undefined;

/** A simple chrome-band / side-bar / panel: renders an HTML string. */
class BandPanel extends GridviewPanel {
    constructor(id: string, component: string, html: string) {
        super(id, component);
        this.element.style.height = '100%';
        this.element.style.width = '100%';
        this.element.innerHTML = html;
        this.api.initialize(this);
    }

    getComponent(): IFrameworkPart {
        return { update: () => {}, dispose: () => {} };
    }
}

class HeaderPanel extends GridviewPanel {
    constructor(id: string, component: string) {
        super(id, component);
        this.element.style.cssText =
            'display:flex;align-items:center;gap:12px;height:100%;padding:0 12px;background:#3c3c3c;color:#cfcfcf;font-size:12px;box-sizing:border-box;';
        this.element.innerHTML = `<span style="color:#fff;font-weight:600">dockview</span><span style="flex:1"></span>`;

        const flip = document.createElement('button');
        flip.textContent = 'Flip side bar';
        flip.addEventListener('click', () => {
            if (!workbench) return;
            workbench.setPrimarySideBarPosition(
                workbench.primarySideBarPosition === 'left' ? 'right' : 'left'
            );
        });

        const align = document.createElement('button');
        const sync = () => {
            align.textContent = `Panel: ${workbench?.toolPanelAlignment ?? 'center'}`;
        };
        align.addEventListener('click', () => {
            if (!workbench) return;
            workbench.setToolPanelAlignment(
                workbench.toolPanelAlignment === 'center' ? 'justify' : 'center'
            );
            sync();
        });
        sync();

        this.element.appendChild(flip);
        this.element.appendChild(align);
        this.api.initialize(this);
    }

    getComponent(): IFrameworkPart {
        return { update: () => {}, dispose: () => {} };
    }
}

class EditorPanel implements IContentRenderer {
    private readonly _element = document.createElement('div');
    get element(): HTMLElement {
        return this._element;
    }
    constructor() {
        this._element.className = 'example-panel';
    }
    init(params: GroupPanelPartInitParameters): void {
        this._element.textContent = params.title ?? 'Editor';
    }
}

const list = (title: string, rows: string[], bg = '#252526'): string =>
    `<div style="height:100%;width:100%;background:${bg};color:#cfcfcf;padding:8px 12px;box-sizing:border-box;font-size:13px;">
        <div style="opacity:.6;font-size:11px">${title}</div>
        ${rows.map((r) => `<div>${r}</div>`).join('')}
    </div>`;

const bandHtml: Record<string, string> = {
    activity:
        '<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px;align-items:center;height:100%;background:#333;font-size:20px;box-sizing:border-box"><span>🗂</span><span>🔍</span><span>⑃</span><span>▷</span></div>',
    explorer: list('EXPLORER', ['▾ src', '&nbsp;&nbsp;index.ts', '&nbsp;&nbsp;readme.md']),
    outline: list('OUTLINE', ['◆ Workbench', '◆ Editor'], '#202020'),
    terminal:
        '<div style="height:100%;background:#181818;color:#d0d0d0;padding:8px 12px;box-sizing:border-box;font-family:monospace;font-size:12px">$ echo "terminal panel"</div>',
    status: '<div style="display:flex;align-items:center;gap:16px;height:100%;padding:0 12px;background:#007acc;color:#fff;font-size:12px;box-sizing:border-box"><span>⎇ main</span><span style="flex:1"></span><span>UTF-8</span><span>TypeScript</span></div>',
};

const api = createDockview(document.getElementById('app')!, {
    theme:
        (window as any).__dockviewColorMode === 'light'
            ? themeLight
            : themeAbyss,
    createComponent: () => new EditorPanel(),
    workbench: {
        header: { component: 'header' },
        statusBar: { component: 'status' },
        activityBar: { component: 'activity' },
        primarySideBar: { component: 'explorer' },
        secondarySideBar: { component: 'outline' },
        toolPanel: {
            component: 'terminal',
            position: 'bottom',
            alignment: 'center',
        },
        createComponent: (options) => {
            if (options.name === 'header') {
                return new HeaderPanel(options.id, options.name);
            }
            return new BandPanel(
                options.id,
                options.name,
                bandHtml[options.name] ?? ''
            );
        },
    },
});

workbench = api.workbench;

api.addPanel({ id: 'index.ts', component: 'editor', title: 'index.ts' });
api.addPanel({
    id: 'readme.md',
    component: 'editor',
    title: 'readme.md',
    position: { referencePanel: 'index.ts', direction: 'right' },
});
