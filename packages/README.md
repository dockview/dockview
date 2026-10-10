# Project Structure

This mono-repository has a number of packages containing the code for the dockview library and the documentation website [dockview.dev](dockview.dev).

## dockview-core

-   Contains the core logic for the dockview library.
-   Written entirely in JavaScript.

## dockview

-   The batteries-included JavaScript package. It re-exports the core API and registers the separable feature modules so consumers get the full feature set out of the box.
-   The package framework-agnostic consumers should install (`npm install dockview`).
-   Has no `react` peer dependency; framework bindings live in the `dockview-<framework>` packages.
-   Published as [dockview](https://www.npmjs.com/package/dockview) on npm.

## dockview-react

-   The React bindings package. Holds the actual React source (`DockviewReact`, hooks, portal bridge).
-   Depends on `dockview`; peer dependency on `react`.
-   Published as [dockview-react](https://www.npmjs.com/package/dockview-react) on npm, the canonical install name for React.

## dockview-tauri-demo

-   A private Tauri desktop shell hosting dockview, used to test host-environment behaviour: popout groups in a native webview, native window isolation, and cross-process layout sync.
-   Not published, and not a supported example.

## docs

-   Code for [dockview.dev](dockview.dev).
