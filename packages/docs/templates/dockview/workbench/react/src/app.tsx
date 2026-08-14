import {
    IDockviewPanelProps,
    IWorkbenchPanelProps,
    WorkbenchApi,
    WorkbenchReadyEvent,
    WorkbenchReact,
    themeAbyss,
    themeLight,
} from 'dockview-react';
import * as React from 'react';

// A handle the header buttons use to drive the workbench after it is ready.
let workbench: WorkbenchApi | undefined;

const band: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    boxSizing: 'border-box',
    color: '#cfcfcf',
    fontSize: 12,
};

const Header = (_props: IWorkbenchPanelProps) => {
    const [, force] = React.useReducer((x) => x + 1, 0);
    return (
        <div style={{ ...band, background: '#3c3c3c', padding: '0 12px', gap: 12 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>dockview</span>
            <span style={{ flex: 1 }} />
            <button
                onClick={() => {
                    if (!workbench) return;
                    workbench.setPrimarySideBarPosition(
                        workbench.primarySideBarPosition === 'left'
                            ? 'right'
                            : 'left'
                    );
                    force();
                }}
            >
                Flip side bar
            </button>
            <button
                onClick={() => {
                    if (!workbench) return;
                    workbench.setPanelAlignment(
                        workbench.panelAlignment === 'center'
                            ? 'justify'
                            : 'center'
                    );
                    force();
                }}
            >
                Panel: {workbench?.panelAlignment ?? 'center'}
            </button>
        </div>
    );
};

const ActivityBar = (_props: IWorkbenchPanelProps) => (
    <div
        style={{
            ...band,
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 6,
            paddingTop: 8,
            background: '#333',
            fontSize: 20,
        }}
    >
        <span>🗂</span>
        <span>🔍</span>
        <span>⑃</span>
        <span>▷</span>
    </div>
);

const listStyle: React.CSSProperties = {
    height: '100%',
    width: '100%',
    background: '#252526',
    color: '#cfcfcf',
    padding: '8px 12px',
    boxSizing: 'border-box',
    fontSize: 13,
};

const Explorer = (_props: IWorkbenchPanelProps) => (
    <div style={listStyle}>
        <div style={{ opacity: 0.6, fontSize: 11 }}>EXPLORER</div>
        <div>▾ src</div>
        <div>&nbsp;&nbsp;app.tsx</div>
        <div>&nbsp;&nbsp;index.tsx</div>
    </div>
);

const Outline = (_props: IWorkbenchPanelProps) => (
    <div style={{ ...listStyle, background: '#202020' }}>
        <div style={{ opacity: 0.6, fontSize: 11 }}>OUTLINE</div>
        <div>◆ App</div>
        <div>◆ Header</div>
    </div>
);

const Terminal = (_props: IWorkbenchPanelProps) => (
    <div
        style={{
            height: '100%',
            background: '#181818',
            color: '#d0d0d0',
            padding: '8px 12px',
            boxSizing: 'border-box',
            fontFamily: 'monospace',
            fontSize: 12,
        }}
    >
        $ echo "terminal panel"
    </div>
);

const StatusBar = (_props: IWorkbenchPanelProps) => (
    <div style={{ ...band, background: '#007acc', color: '#fff', padding: '0 12px', gap: 16 }}>
        <span>⎇ main</span>
        <span style={{ flex: 1 }} />
        <span>UTF-8</span>
        <span>TypeScript</span>
    </div>
);

const components = {
    header: Header,
    activity: ActivityBar,
    explorer: Explorer,
    outline: Outline,
    terminal: Terminal,
    status: StatusBar,
};

const Editor = (props: IDockviewPanelProps) => (
    <div className="example-panel">{props.api.title}</div>
);

const editorComponents = { editor: Editor };

export default (props: { theme?: string }) => {
    const onReady = (event: WorkbenchReadyEvent) => {
        workbench = event.api;

        const dv = event.api.dockview;
        dv.addPanel({ id: 'app.tsx', component: 'editor', title: 'app.tsx' });
        dv.addPanel({
            id: 'readme.md',
            component: 'editor',
            title: 'readme.md',
            position: { referencePanel: 'app.tsx', direction: 'right' },
        });
    };

    return (
        <WorkbenchReact
            className={props.theme || 'dockview-theme-abyss'}
            components={components}
            editorComponents={editorComponents}
            editorProps={{
                theme: props.theme?.includes('light') ? themeLight : themeAbyss,
            }}
            header={{ component: 'header' }}
            statusBar={{ component: 'status' }}
            activityBar={{ component: 'activity' }}
            primarySideBar={{ component: 'explorer' }}
            secondarySideBar={{ component: 'outline' }}
            panel={{ component: 'terminal', position: 'bottom', alignment: 'center' }}
            onReady={onReady}
        />
    );
};
