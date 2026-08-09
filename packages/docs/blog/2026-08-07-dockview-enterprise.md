---
slug: dockview-enterprise
title: Dockview launches an enterprise version
description: 'From version 8.0.0 Dockview ships in two forms: the free MIT version, and a commercially licensed enterprise version.'
authors: [mathuo]
tags: [enterprise]
---

Starting with version 8.0.0, Dockview ships in two forms: a free version and an enterprise version.

Dockview and all of the framework packages remain free and open under an MIT licence, exactly as they are today. Alongside them, **Dockview Enterprise** is a commercially licensed extension.

Nothing you rely on today has been taken away. If a feature was free in Dockview, it stays free, and every Dockview package, enterprise included, will always have zero external dependencies.

If you are already using Dockview and you don't need the enterprise features, there is nothing to do. No licence key, no extra package, no import changes.

<!-- truncate -->

<BlogReaction id="v8-feedback" />

## Why enterprise?

Dockview started as a pet project. I was looking for a good docking library, primarily for financial applications, and I couldn't find one. It has grown steadily since, and today Dockview is:

- Passing **650,000 monthly downloads**, making it the most downloaded docking library for JavaScript
- Over **3,300 GitHub stars**
- Ranking first for many of its repository keywords
- Used by **300+ public projects**, and many more in private and enterprise codebases

There are still many features I want to build, and many of them will stay in the free tier. But the bigger Dockview gets, the more time it takes to maintain and extend. An enterprise version is what pays for that time. If it works, I get to spend more of it on Dockview.

## How it works

Dockview itself stays open source under MIT. The enterprise code lives in the same repository and you can read all of it, though it is source-available under the commercial licence rather than MIT.

Enterprise features ship in a separate `dockview-enterprise` package and are unlocked with a licence key. See [Enterprise setup](/docs/overview/enterprise-setup) for installing the package and applying a key.

You are free to evaluate the enterprise features locally without a key, where Dockview shows a small watermark in the corner of the layout. A licence is required to deploy to production. If you want to trial it first, you can [start a free 30-day trial](/trial).

## What's in enterprise?

The first release covers:

- **Multi-row tabs** and **pinned tabs**: wrap a tab strip onto extra rows, or pin the tabs that matter so they sort first and never overflow
- **Advanced overflow**: the overflow dropdown becomes a command-palette style switcher, with search, most-recently-used ordering and keyboard navigation
- **Context menus** for tabs and tab group chips
- **DnD compass**: an explicit set of drop targets to aim at while dragging, instead of resolving the drop from whichever quadrant the cursor is over
- **Smart guides**: alignment lines and magnetic snapping while dragging floating groups
- **Auto-hide edge groups** and **dock to edge**: collapsed edges that peek open as an overlay without reflowing the grid, and edges that take up zero space until you drop a panel on them
- **Layout history**: a bounded undo/redo stack for layout changes, so a mis-drag or an accidental close is recoverable
- **Keyboard docking** and spatial navigation: move and dock panels without a mouse

Deciding what went where was the hardest part. Dockview Enterprise is for enterprises, and it should never come at the expense of Dockview being a great free layout manager.

The rule I settled on: the free version should aim to never be behind the competition. Enterprise is ideally for capabilities no other library gives away, and for the ones used mostly by large enterprises.

Enterprise is also for customers who want premium support, and a say in the roadmap and which features come next.

There is plenty more planned, on both sides.

[See the full comparison](/docs/overview/licence).

## Pricing

Dockview Enterprise is licensed per developer, per year. Applications are unlimited, and any version released on or before your key's expiry date keeps working with that key forever, so you are never locked out of a version you have paid for. See [Licensing](/docs/overview/licence) for the feature-by-feature comparison, or [Dockview Enterprise](pathname:///enterprise) for current pricing.

If you need an SLA, a bespoke agreement, or something else entirely, [get in touch](/contact).

## Early users and small businesses

If you have ever interacted with the project on GitHub (an issue, a discussion, a pull request, however small) and you need enterprise features, email me at [matt@dockview.dev](mailto:matt@dockview.dev) and we'll apply a heavily discounted rate. Dockview's success depends on its users, and if you adopted it early I want to repay that.

The same goes for small and solo businesses. Enterprise is aimed at larger organisations, where an annual licence makes sense for priority features and support. If you're pre-revenue, or just not there yet, I don't want price to be the barrier.

Either way, email me at [matt@dockview.dev](mailto:matt@dockview.dev) before you buy and we'll work something out.

---

Thanks for reading, and thanks for using Dockview.

Matt

<BlogFeedback id="v8-feedback" />
