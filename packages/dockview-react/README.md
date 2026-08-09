<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-dark.svg?raw=true">
  <img src="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-light.svg?raw=true" alt="Dockview" width="480">
</picture>

<h1>dockview-react</h1>

<p>React bindings for dockview, a zero dependency layout manager supporting tabs, groups, grids and splitviews</p>

[![npm version](https://img.shields.io/npm/v/dockview-react)](https://www.npmjs.com/package/dockview-react)
[![npm downloads](https://img.shields.io/npm/dm/dockview-react)](https://www.npmjs.com/package/dockview-react)
[![CI](https://img.shields.io/github/actions/workflow/status/dockview/dockview/main.yml?branch=master&label=CI)](https://github.com/dockview/dockview/actions?query=workflow%3ACI)
[![Coverage](https://img.shields.io/sonar/coverage/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Quality gate](https://img.shields.io/sonar/quality_gate/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/dockview-react?label=size)](https://bundlephobia.com/result?p=dockview-react)

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

Dockview has a peer dependency on `react` and `react-dom`, versions 16.8 to 19. Install from [npm](https://www.npmjs.com/package/dockview-react):

```
npm install dockview-react
```

Import the stylesheet:

```css
@import 'dockview-react/dist/styles/dockview.css';
```

Pass a theme and render the component:

```tsx
import { DockviewReact, themeDark } from 'dockview-react';

const components = {
    myComponent: (props) => <div>Hello World</div>,
};

function App() {
    return (
        <div style={{ height: '400px' }}>
            <DockviewReact
                theme={themeDark}
                components={components}
                onReady={(event) => {
                    event.api.addPanel({
                        id: 'panel_1',
                        component: 'myComponent',
                    });
                }}
            />
        </div>
    );
}
```

See the [documentation](https://dockview.dev) for full examples.

Want to verify our builds? Go [here](https://www.npmjs.com/package/dockview-react#Provenance).
