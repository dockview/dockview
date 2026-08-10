// @ts-check
/**
 * Prompt → storyboard composer.
 *
 * Turns a plain-English prompt (or an explicit --features list) into a
 * cinematic storyboard built from the feature beats in beats.mjs. The mapping is
 * deterministic: prompt text is matched against each beat's aliases, matched
 * beats are ordered so the film flows (compose first, the "wow" closers last),
 * and an intro title card + branded end card are wrapped around them.
 *
 *   yarn record-clips --prompt "show floating panels, theming and pop-out"
 *   yarn record-clips --features float,theming,popout
 *   yarn record-clips --prompt "a full tour of everything"
 *   yarn record-clips --list-features
 */

import { beats, beatList } from './beats.mjs';

// Prompt tokens that mean "show the lot".
const EVERYTHING = [
    'everything',
    'all features',
    'full tour',
    'complete tour',
    'the works',
    'capabilities',
    'kitchen sink',
    'show it all',
    'all of it',
];

// A curated, well-paced full tour (order handled by beat.order).
const FULL_TOUR = [
    'compose',
    'float',
    'nested',
    'focus',
    'tabGroups',
    'headerPosition',
    'multiRowTabs',
    'edgeGroups',
    'autoHide',
    'emptyState',
    'popout',
    'theming',
];

/**
 * Choose the beats for a prompt / feature list.
 * @returns {{ selected: any[], matched: string[], unmatched: boolean }}
 */
export function selectBeats({ prompt, features }) {
    // Explicit --features wins and is validated.
    if (features) {
        const ids = String(features)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const bad = ids.filter((id) => !beats[id]);
        if (bad.length) {
            throw new Error(
                `Unknown feature(s): ${bad.join(', ')}\n` +
                    `Available: ${Object.keys(beats).join(', ')}`
            );
        }
        return {
            selected: ids.map((id) => beats[id]).sort((a, b) => a.order - b.order),
            matched: ids,
            unmatched: false,
        };
    }

    const text = String(prompt || '').toLowerCase();

    // "everything" → the full curated tour.
    if (EVERYTHING.some((t) => text.includes(t))) {
        return {
            selected: FULL_TOUR.map((id) => beats[id]).sort(
                (a, b) => a.order - b.order
            ),
            matched: FULL_TOUR,
            unmatched: false,
        };
    }

    // Alias match — a beat is in if any of its aliases appears in the prompt.
    const hits = beatList.filter((b) =>
        b.aliases.some((a) => text.includes(a))
    );

    if (hits.length) {
        return {
            selected: hits.sort((a, b) => a.order - b.order),
            matched: hits.map((b) => b.id),
            unmatched: false,
        };
    }

    // Nothing matched — fall back to a short, punchy default reel.
    const fallback = ['compose', 'float', 'focus', 'popout', 'theming'];
    return {
        selected: fallback.map((id) => beats[id]).sort((a, b) => a.order - b.order),
        matched: fallback,
        unmatched: true,
    };
}

/**
 * Build a storyboard function `async ({ page, dir, size, wait, movie }) => {}`
 * from a prompt / feature list. Same shape as the entries in storyboards.mjs, so
 * the recorder drives it identically.
 */
export function composeStoryboard(opts = {}) {
    const { selected } = selectBeats(opts);
    const ids = selected.map((b) => b.id);
    const hasCompose = ids.includes('compose');
    const anyNeedsBase = selected.some((b) => b.needsBase) || hasCompose;

    const eyebrow = opts.eyebrow || 'DOCKVIEW';
    const headline =
        opts.headline || 'The layout engine for serious applications';
    // A clean capability strip from the selected beats' short tags reads more
    // polished on the title card than echoing the raw (imperative) prompt.
    const tags = selected.map((b) => b.tag).filter(Boolean);
    const subhead =
        opts.subhead ||
        (tags.length
            ? tags.join('   ·   ')
            : 'The layout engine for serious applications');
    const tagline =
        opts.tagline || 'The layout engine for serious applications';

    return async (ctx) => {
        const { wait, movie } = ctx;
        // Pass the panel roster so beats can reference base panels.
        ctx.base = { ids: ['chart', 'watch', 'depth', 'positions', 'tape', 'heat', 'term', 'nodes'] };

        // ---- Intro title card ----
        await movie('titlecard', true, headline, subhead, eyebrow);
        await wait(2600);
        await movie('titlecard', false);
        await wait(650);

        // ---- Base workspace (once) ----
        if (hasCompose) {
            await movie('caption', ...beats.compose.caption);
            await beats.compose.run(ctx);
        } else if (anyNeedsBase) {
            await movie('caption', 'Compose', 'one engine · any layout');
            const { buildBase } = await import('./beats.mjs');
            await buildBase(ctx);
            await wait(1400);
        }

        // ---- Feature beats ----
        for (const beat of selected) {
            if (beat.id === 'compose') continue; // already run as the base
            await movie('caption', ...beat.caption);
            await beat.run(ctx);
        }

        // ---- End card ----
        await movie('caption', '');
        await wait(200);
        await movie('endcard', true, tagline);
        await wait(3200);
    };
}

/** Pretty-print the feature catalogue for --list-features. */
export function formatFeatureList() {
    const rows = beatList.map(
        (b) => `  ${b.id.padEnd(16)} ${b.title}`
    );
    return (
        'Available features (use --features <id,id,…> or --prompt "…"):\n\n' +
        rows.join('\n') +
        '\n\n  everything        The full curated tour\n'
    );
}
