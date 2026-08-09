<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-dark.svg?raw=true">
  <img src="https://github.com/dockview/dockview/blob/HEAD/static/img/dockview-lockup-light.svg?raw=true" alt="Dockview" width="480">
</picture>

<h1>dockview-enterprise</h1>

<p>Enterprise features and licensing for dockview</p>

[![npm version](https://img.shields.io/npm/v/dockview-enterprise)](https://www.npmjs.com/package/dockview-enterprise)
[![npm downloads](https://img.shields.io/npm/dm/dockview-enterprise)](https://www.npmjs.com/package/dockview-enterprise)
[![CI](https://img.shields.io/github/actions/workflow/status/dockview/dockview/main.yml?branch=master&label=CI)](https://github.com/dockview/dockview/actions?query=workflow%3ACI)
[![Coverage](https://img.shields.io/sonar/coverage/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)
[![Quality gate](https://img.shields.io/sonar/quality_gate/dockview_dockview?server=https%3A%2F%2Fsonarcloud.io)](https://sonarcloud.io/summary/overall?id=dockview_dockview)

</div>

---

`dockview-enterprise` is a drop-in **superset** of the free `dockview` package:
it re-exports the entire `dockview` API and adds the enterprise features plus
licensing. Importing the package enables all of them.

See [licensing](https://dockview.dev/docs/overview/licence) for what's included.

## Install

```sh
npm install dockview-enterprise
```

It depends on `dockview`; use it **instead of** `dockview` (not alongside). Everything
`dockview` exports is re-exported here.

## Usage

```ts
import { DockviewComponent, LicenseManager } from 'dockview-enterprise';

// Set your license key.
LicenseManager.setLicenseKey('your-license-key');
```

Merely importing `dockview-enterprise` enables the enterprise features and the
license check, so their options become available on every `DockviewComponent`.
No further setup is needed.

Using a framework binding (`dockview-react` / `dockview-vue` /
`dockview-angular`)? Keep importing your components from the binding and add a
one-line side-effect import to activate the enterprise features:

```ts
import 'dockview-enterprise';
```

## License

Enterprise features are governed by a license key set via
`LicenseManager.setLicenseKey(...)`. See
[licensing](https://dockview.dev/docs/overview/licence).

`dockview-enterprise` is proprietary software governed by a commercial licence
agreement. See [LICENCE.md](./LICENCE.md).
