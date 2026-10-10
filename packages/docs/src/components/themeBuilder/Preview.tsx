import React from 'react';
import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    DockviewTheme,
    IDockviewPanelProps,
} from 'dockview-react';
import { PREVIEW_CLASS, cssRule } from './model';
import styles from './themeBuilder.module.css';

// Plain content so the theme is all that shows: text in the theme's own tab
// colours on a transparent background.
const SamplePanel = (props: IDockviewPanelProps) => (
    <div className={styles.samplePanel}>
        <div className={styles.sampleTitle}>{props.api.title}</div>
        <div className={styles.sampleLine} style={{ width: '72%' }} />
        <div className={styles.sampleLine} style={{ width: '54%' }} />
        <div className={styles.sampleLine} style={{ width: '63%' }} />
        <div className={styles.sampleMuted}>
            Drag tabs, resize groups or float a panel to try the theme.
        </div>
    </div>
);

const components = { sample: SamplePanel };

function buildLayout(api: DockviewApi) {
    const add = (
        id: string,
        title: string,
        position?: Parameters<DockviewApi['addPanel']>[0]['position'],
        extra: Partial<Parameters<DockviewApi['addPanel']>[0]> = {}
    ) =>
        api.addPanel({
            id,
            title,
            component: 'sample',
            ...(position ? { position } : {}),
            ...extra,
        } as Parameters<DockviewApi['addPanel']>[0]);

    add('index', 'index.ts');
    const app = add('app', 'app.tsx');
    add('styles', 'theme.scss');
    add('preview', 'Preview', { referencePanel: 'app', direction: 'right' });
    add('terminal', 'Terminal', { referencePanel: 'app', direction: 'below' });
    add('problems', 'Problems', { referencePanel: 'terminal' });

    try {
        api.addEdgeGroup('left', { id: 'left', initialSize: 200 });
        add('explorer', 'Explorer', { referenceGroup: 'left' });
        add('search', 'Search', { referenceGroup: 'left' });
        api.getGroup('left')?.api.collapse();
        api.addEdgeGroup('right', { id: 'right', initialSize: 190 });
        add('outline', 'Outline', { referenceGroup: 'right' });
    } catch {
        // Edge groups are optional for the preview.
    }

    add('inspector', 'Inspector', undefined, {
        floating: { position: { right: 40, bottom: 40 }, width: 300, height: 180 },
    });
    add('console', 'Console', { referencePanel: 'inspector' });

    app.api.setActive();
}

/** What a click in the preview selects: a token, or a whole group of them. */
export type InspectTarget = { token?: string; group?: string };

function inspectTargetOf(el: Element): {
    element: Element;
    target: InspectTarget;
} | null {
    const tab = el.closest('.dv-tab');
    if (tab) {
        const focused = !!tab.closest('.dv-active-group');
        const selected = tab.classList.contains('dv-active-tab');
        const scope = focused ? 'activegroup' : 'inactivegroup';
        const which = selected ? 'visiblepanel' : 'hiddenpanel';
        return {
            element: tab,
            target: { token: `--dv-${scope}-${which}-tab-background-color` },
        };
    }
    const strip = el.closest('.dv-tabs-and-actions-container');
    if (strip) {
        return {
            element: strip,
            target: {
                token: '--dv-tabs-and-actions-container-background-color',
            },
        };
    }
    const sash = el.closest('.dv-sash');
    if (sash) {
        return { element: sash, target: { token: '--dv-active-sash-color' } };
    }
    const floating = el.closest('.dv-resize-container');
    if (floating && !el.closest('.dv-content-container')) {
        return { element: floating, target: { group: 'Floating groups' } };
    }
    const content = el.closest('.dv-content-container');
    if (content) {
        return {
            element: content,
            target: { token: '--dv-group-view-background-color' },
        };
    }
    const group = el.closest('.dv-groupview');
    if (group) {
        return {
            element: group,
            target: { token: '--dv-group-view-background-color' },
        };
    }
    return null;
}

export const Preview = (props: {
    theme: DockviewTheme;
    vars: Record<string, string>;
    inspecting: boolean;
    onInspect: (target: InspectTarget) => void;
    onRendered: (root: HTMLElement) => void;
}) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const styleRef = React.useRef<HTMLStyleElement | null>(null);
    React.useEffect(
        () => () => {
            styleRef.current?.remove();
            styleRef.current = null;
        },
        []
    );
    const theme = React.useMemo(
        () => ({
            ...props.theme,
            className: `${props.theme.className} ${PREVIEW_CLASS}`,
        }),
        [props.theme]
    );

    const onReady = (event: DockviewReadyEvent) => {
        buildLayout(event.api);
    };

    // The builder's custom properties go in a one-class rule in a stylesheet
    // after dockview's, exactly as the exported CSS applies them, so the
    // preview shows what the export produces.
    React.useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (!styleRef.current) {
            styleRef.current = document.createElement('style');
            document.head.appendChild(styleRef.current);
        }
        styleRef.current.textContent = cssRule(
            `.${PREVIEW_CLASS}`,
            props.vars
        );
        const id = requestAnimationFrame(() => {
            const root = container.querySelector<HTMLElement>(
                '[class*="dockview-theme"]'
            );
            if (root) props.onRendered(root);
        });
        return () => cancelAnimationFrame(id);
    });

    // Inspect mode: outline what is under the pointer, select it on click.
    React.useEffect(() => {
        const container = containerRef.current;
        if (!container || !props.inspecting) return;
        let hovered: Element | null = null;
        const clear = () => {
            hovered?.classList.remove(styles.inspectHover);
            hovered = null;
        };
        const onMove = (e: MouseEvent) => {
            const hit = inspectTargetOf(e.target as Element);
            if (hit?.element !== hovered) {
                clear();
                hovered = hit?.element ?? null;
                hovered?.classList.add(styles.inspectHover);
            }
        };
        const onClick = (e: MouseEvent) => {
            const hit = inspectTargetOf(e.target as Element);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            props.onInspect(hit.target);
        };
        // Capture phase, so the dock does not also act on the click.
        container.addEventListener('mousemove', onMove);
        container.addEventListener('mouseleave', clear);
        container.addEventListener('click', onClick, true);
        container.addEventListener('pointerdown', stopIfInspecting, true);
        return () => {
            clear();
            container.removeEventListener('mousemove', onMove);
            container.removeEventListener('mouseleave', clear);
            container.removeEventListener('click', onClick, true);
            container.removeEventListener('pointerdown', stopIfInspecting, true);
        };
    }, [props.inspecting, props.onInspect]);

    return (
        <div
            ref={containerRef}
            className={`${styles.preview} ${props.inspecting ? styles.previewInspecting : ''}`}
        >
            <DockviewReact
                theme={theme}
                components={components}
                onReady={onReady}
            />
        </div>
    );
};

// While inspecting, pointer presses select rather than drag or resize.
function stopIfInspecting(e: PointerEvent) {
    e.stopPropagation();
}
