# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security reports.

Preferred: use [GitHub's private vulnerability reporting](https://github.com/dockview/dockview/security/advisories/new) on this repository.

Alternative: email **contact@dockview.dev**.

When reporting, please include:

- A clear description of the issue and its impact.
- A minimal reproduction (a sandbox link, a code snippet, or a small repo).
- Affected Dockview version(s) and, where relevant, browser and framework (React / Vue / Angular / vanilla).
- Any suggested remediation, if you have one.

You can expect an acknowledgement within **7 days** and a triage decision within **14 days**. Coordinated disclosure timelines will be agreed on a per-report basis.

## Supported Versions

Security fixes are applied to the **latest released minor** of Dockview. Older versions are not patched; if you are on an older line, please upgrade as part of the fix.

## Scope

In scope:

- XSS, prototype pollution, or other injection issues reachable through Dockview's public API surface (serialized layout state, drop-data handling, popout window creation, etc.).
- Regressions that break Dockview's compatibility with strict [Content Security Policy](https://dockview.dev/docs/core/security) or [Trusted Types](https://dockview.dev/docs/core/security).
- Supply-chain or build-pipeline issues affecting published artifacts.

Out of scope:

- Issues only reproducible when the host application uses `'unsafe-inline'` or `'unsafe-eval'` in its CSP.
- XSS introduced by consumer-supplied components rendered through `tabComponent`, `watermarkComponent`, panel content, etc. — Dockview renders whatever the host application provides; sanitising that content is the host's responsibility.
- Issues in the documentation site, demo sandboxes, or development tooling that are not present in published packages.
- Denial-of-service through pathological layout input on the consumer's own page.

## Build and release integrity

- All build and publish workflows are public and live under [`.github/workflows`](https://github.com/dockview/dockview/tree/master/.github/workflows).
- npm releases are published with [provenance statements](https://docs.npmjs.com/generating-provenance-statements/) so the source commit and workflow run can be verified.
- Code is statically analysed by [SonarCloud](https://sonarcloud.io/summary/overall?id=dockview_dockview) on every pull request and by [CodeQL](https://github.com/dockview/dockview/security/code-scanning) on a nightly schedule.

## Configuration guidance

For configuring Dockview under a strict CSP, Trusted Types, or same-origin popout policies, see the [Security guide](https://dockview.dev/docs/core/security) in the documentation.
