import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Input, NgModule, Type } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewPanelApi,
    DockviewReadyEvent,
    WorkbenchApi,
    themeAbyss,
    themeLight,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// A handle the header buttons use to drive the workbench after it is ready.
let workbench: WorkbenchApi | undefined;

@Component({
    selector: 'wb-header',
    template: `
        <div
            style="display:flex;align-items:center;gap:12px;height:100%;padding:0 12px;background:#3c3c3c;color:#cfcfcf;font-size:12px;box-sizing:border-box"
        >
            <span style="color:#fff;font-weight:600">dockview</span>
            <span style="flex:1"></span>
            <button (click)="flip()">Flip side bar</button>
            <button (click)="toggleAlign()">Panel: {{ alignment }}</button>
        </div>
    `,
})
export class HeaderComponent {
    alignment = 'center';
    flip() {
        if (!workbench) return;
        workbench.setPrimarySideBarPosition(
            workbench.primarySideBarPosition === 'left' ? 'right' : 'left'
        );
    }
    toggleAlign() {
        if (!workbench) return;
        workbench.setToolPanelAlignment(
            workbench.toolPanelAlignment === 'center' ? 'justify' : 'center'
        );
        this.alignment = workbench.toolPanelAlignment;
    }
}

@Component({
    selector: 'wb-activity',
    template: `
        <div
            style="display:flex;flex-direction:column;gap:6px;padding-top:8px;align-items:center;height:100%;background:#333;font-size:20px;box-sizing:border-box"
        >
            <span>🗂</span><span>🔍</span><span>⑃</span><span>▷</span>
        </div>
    `,
})
export class ActivityBarComponent {}

@Component({
    selector: 'wb-explorer',
    template: `
        <div
            style="height:100%;width:100%;background:#252526;color:#cfcfcf;padding:8px 12px;box-sizing:border-box;font-size:13px"
        >
            <div style="opacity:.6;font-size:11px">EXPLORER</div>
            <div>▾ src</div>
            <div>&nbsp;&nbsp;index.ts</div>
            <div>&nbsp;&nbsp;readme.md</div>
        </div>
    `,
})
export class ExplorerComponent {}

@Component({
    selector: 'wb-outline',
    template: `
        <div
            style="height:100%;width:100%;background:#202020;color:#cfcfcf;padding:8px 12px;box-sizing:border-box;font-size:13px"
        >
            <div style="opacity:.6;font-size:11px">OUTLINE</div>
            <div>◆ Workbench</div>
            <div>◆ Editor</div>
        </div>
    `,
})
export class OutlineComponent {}

@Component({
    selector: 'wb-terminal',
    template: `
        <div
            style="height:100%;background:#181818;color:#d0d0d0;padding:8px 12px;box-sizing:border-box;font-family:monospace;font-size:12px"
        >
            $ echo "terminal panel"
        </div>
    `,
})
export class TerminalComponent {}

@Component({
    selector: 'wb-status',
    template: `
        <div
            style="display:flex;align-items:center;gap:16px;height:100%;padding:0 12px;background:#007acc;color:#fff;font-size:12px;box-sizing:border-box"
        >
            <span>⎇ main</span><span style="flex:1"></span><span>UTF-8</span
            ><span>TypeScript</span>
        </div>
    `,
})
export class StatusBarComponent {}

@Component({
    selector: 'wb-editor',
    template: `<div class="example-panel">{{ api?.title }}</div>`,
})
export class EditorComponent {
    @Input() api!: DockviewPanelApi;
}

@Component({
    selector: 'app-root',
    template: `
        <dv-dockview
            style="width:100%;height:100%"
            [components]="editorComponents"
            [theme]="theme"
            [workbench]="workbenchOptions"
            (ready)="onReady($event)"
        >
        </dv-dockview>
    `,
})
export class AppComponent {
    editorComponents: Record<string, Type<any>> = { editor: EditorComponent };
    theme =
        (window as any).__dockviewColorMode === 'light'
            ? themeLight
            : themeAbyss;
    workbenchOptions = {
        components: {
            header: HeaderComponent,
            activity: ActivityBarComponent,
            explorer: ExplorerComponent,
            outline: OutlineComponent,
            terminal: TerminalComponent,
            status: StatusBarComponent,
        },
        header: { component: 'header' },
        statusBar: { component: 'status' },
        activityBar: { component: 'activity' },
        primarySideBar: { component: 'explorer' },
        secondarySideBar: { component: 'outline' },
        toolPanel: {
            component: 'terminal',
            position: 'bottom' as const,
            alignment: 'center' as const,
        },
    };

    onReady(event: DockviewReadyEvent) {
        workbench = event.api.workbench;
        const dv = event.api;
        dv.addPanel({ id: 'index.ts', component: 'editor', title: 'index.ts' });
        dv.addPanel({
            id: 'readme.md',
            component: 'editor',
            title: 'readme.md',
            position: { referencePanel: 'index.ts', direction: 'right' },
        });
    }
}

@NgModule({
    declarations: [
        AppComponent,
        HeaderComponent,
        ActivityBarComponent,
        ExplorerComponent,
        OutlineComponent,
        TerminalComponent,
        StatusBarComponent,
        EditorComponent,
    ],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
