<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-dark.svg?raw=true">
  <img src="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-light.svg?raw=true" alt="Dockview" width="480">
</picture>

<h1>dockview</h1>

<p>Zero dependency layout manager supporting tabs, groups, grids and splitviews</p>

[![npm version](https://img.shields.io/npm/v/dockview)](https://www.npmjs.com/package/dockview)
[![npm downloads](https://img.shields.io/npm/dm/dockview)](https://www.npmjs.com/package/dockview)
[![CI](https://img.shields.io/github/actions/workflow/status/dockview/dockview/main.yml?branch=master&label=CI)](https://github.com/dockview/dockview/actions?query=workflow%3ACI)
[![Coverage](https://img.shields.io/sonar/coverage/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Quality gate](https://img.shields.io/sonar/quality_gate/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/dockview?label=size)](https://bundlephobia.com/result?p=dockview)

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

`dockview` is the JavaScript package. Using a framework? Install the
matching bindings instead: [`dockview-react`](https://www.npmjs.com/package/dockview-react),
[`dockview-vue`](https://www.npmjs.com/package/dockview-vue) or
[`dockview-angular`](https://www.npmjs.com/package/dockview-angular).

Install from [npm](https://www.npmjs.com/package/dockview):

```
npm install dockview
```

Import the stylesheet:

```css
@import 'dockview/dist/styles/dockview.css';
```

Create a dockview instance and pass a theme:

```ts
import { DockviewComponent, themeDark } from 'dockview';

const element = document.getElementById('app');

const dockview = new DockviewComponent(element, {
    theme: themeDark,
    createComponent: (options) => {
        switch (options.name) {
            case 'my-component':
                return {
                    init: (params) => {
                        params.containerElement.textContent = 'Hello World';
                    },
                };
        }
    },
});

dockview.addPanel({
    id: 'panel_1',
    component: 'my-component',
});
```

See the [documentation](https://dockview.dev) for full examples.

Want to verify our builds? Go [here](https://www.npmjs.com/package/dockview#Provenance).
