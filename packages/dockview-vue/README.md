<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-dark.svg?raw=true">
  <img src="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-light.svg?raw=true" alt="Dockview" width="480">
</picture>

<h1>dockview-vue</h1>

<p>Vue 3 bindings for dockview, a zero dependency layout manager supporting tabs, groups, grids and splitviews</p>

[![npm version](https://img.shields.io/npm/v/dockview-vue)](https://www.npmjs.com/package/dockview-vue)
[![npm downloads](https://img.shields.io/npm/dm/dockview-vue)](https://www.npmjs.com/package/dockview-vue)
[![CI](https://img.shields.io/github/actions/workflow/status/dockview/dockview/main.yml?branch=master&label=CI)](https://github.com/dockview/dockview/actions?query=workflow%3ACI)
[![Coverage](https://img.shields.io/sonar/coverage/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Quality gate](https://img.shields.io/sonar/quality_gate/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/dockview-vue?label=size)](https://bundlephobia.com/result?p=dockview-vue)

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

Dockview-vue has a peer dependency on `vue >= 3.4.0`. Install from [npm](https://www.npmjs.com/package/dockview-vue):

```
npm install dockview-vue
```

Import the stylesheet:

```css
@import 'dockview-vue/dist/styles/dockview.css';
```

Use the component in a Vue SFC:

```vue
<template>
    <div style="height: 400px">
        <DockviewVue :theme="theme" @ready="onReady">
            <template #myComponent="{ params }">
                <div>Hello World</div>
            </template>
        </DockviewVue>
    </div>
</template>

<script setup lang="ts">
import { DockviewVue, themeDark } from 'dockview-vue';
import type { DockviewReadyEvent } from 'dockview-vue';

const theme = themeDark;

function onReady(event: DockviewReadyEvent) {
    event.api.addPanel({
        id: 'panel_1',
        component: 'myComponent',
    });
}
</script>
```

See the [documentation](https://dockview.dev) for full examples.

Want to verify our builds? Go [here](https://www.npmjs.com/package/dockview-vue#Provenance).
