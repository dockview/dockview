<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-dark.svg?raw=true">
  <img src="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-light.svg?raw=true" alt="Dockview" width="480">
</picture>

<h1>dockview-angular</h1>

<p>Angular bindings for dockview, a zero dependency layout manager supporting tabs, groups, grids and splitviews</p>

[![npm version](https://img.shields.io/npm/v/dockview-angular)](https://www.npmjs.com/package/dockview-angular)
[![npm downloads](https://img.shields.io/npm/dm/dockview-angular)](https://www.npmjs.com/package/dockview-angular)
[![CI](https://img.shields.io/github/actions/workflow/status/dockview/dockview/main.yml?branch=master&label=CI)](https://github.com/dockview/dockview/actions?query=workflow%3ACI)
[![Coverage](https://img.shields.io/sonar/coverage/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Quality gate](https://img.shields.io/sonar/quality_gate/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/dockview-angular?label=size)](https://bundlephobia.com/result?p=dockview-angular)

</div>

---

![A Dockview layout showing docked, tabbed and split panels in a trading workbench](https://github.com/dockview/dockview/blob/HEAD/static/img/demo-hero.webp?raw=true)

Please see the website: https://dockview.dev

## Features

-   Serialization / deserialization with full layout management
-   Support for split-views, grid-views and 'dockable' views
-   Themeable and customizable
-   Tab and Group docking / Drag n' Drop
-   Touch & mobile support
-   Popout Windows
-   Floating Groups
-   Edge Groups
-   Tab Groups
-   Extensive API
-   Supports Shadow DOMs
-   High test coverage
-   Documentation website with live examples
-   Transparent builds and Code Analysis
-   Security in mind - verified publishing and builds through GitHub Actions

## Quick Start

Dockview-angular has a peer dependency on `@angular/core >= 21.0.6`. Install from [npm](https://www.npmjs.com/package/dockview-angular):

```
npm install dockview-angular
```

Import the stylesheet in your `styles.css` or `angular.json`:

```css
@import 'dockview-angular/dist/dockview.css';
```

Use the component in your Angular template:

```typescript
import { Component } from '@angular/core';
import {
    DockviewAngularModule,
    DockviewReadyEvent,
    themeDark,
} from 'dockview-angular';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [DockviewAngularModule],
    template: `
        <div style="height: 400px">
            <dv-dockview
                [theme]="theme"
                [components]="components"
                (ready)="onReady($event)"
            ></dv-dockview>
        </div>
    `,
})
export class AppComponent {
    theme = themeDark;

    components = {
        myComponent: /* your panel component */,
    };

    onReady(event: DockviewReadyEvent) {
        event.api.addPanel({
            id: 'panel_1',
            component: 'myComponent',
        });
    }
}
```

See the [documentation](https://dockview.dev) for full examples.

Want to verify our builds? Go [here](https://www.npmjs.com/package/dockview-angular#Provenance).
