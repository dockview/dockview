import React from 'react';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { EnterpriseBadge } from '@site/src/components/ui/enterprise/enterpriseBadge';
import './examples.scss';

type Framework = 'react' | 'vue' | 'angular' | 'typescript';

interface Example {
    name: string;
    frameworks: Framework[];
    /** Requires a `dockview-enterprise` feature, marked with the Enterprise pill. */
    enterprise?: boolean;
}

interface ComponentGroup {
    component: string;
    label: string;
    description: string;
    examples: Example[];
}

const FRAMEWORK_META: Record<
    Framework,
    { label: string; icon: string; color: string }
> = {
    react: { label: 'React', icon: 'img/react-icon.svg', color: '#61dafb' },
    vue: { label: 'Vue', icon: 'img/vue-icon.svg', color: '#42b883' },
    angular: {
        label: 'Angular',
        icon: 'img/angular-icon.svg',
        color: '#dd0031',
    },
    typescript: {
        label: 'TypeScript',
        icon: 'img/js-icon.svg',
        color: '#f7df1e',
    },
};

const COMPONENTS: ComponentGroup[] = [
    {
        component: 'dockview',
        label: 'Dockview',
        description:
            'Full-featured docking layout with tabs, groups, drag & drop, floating panels, and popout windows.',
        examples: [
            {
                name: 'auto-hide-edge-groups',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'basic',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'constraints',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'context-menu',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'custom-header',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'demo-dockview',
                frameworks: ['react', 'angular'],
                enterprise: true,
            },
            {
                name: 'dnd-events',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'dnd-external',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'dnd-compass',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'edge-groups',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'floating-groups',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'full-width-tab',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'group-actions',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'iframe',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'keyboard',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'layout',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'layout-history',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'locked',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'maximize-group',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'nested',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'pinned-tabs',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'popout-group',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'render-mode',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'resize',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'resize-container',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'scrollbars',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'stacked-edge-groups',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'smart-guides',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'tab-groups',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'tab-overflow',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
                enterprise: true,
            },
            {
                name: 'tabview',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'update-parameters',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'update-title',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
            {
                name: 'watermark',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
        ],
    },
    {
        component: 'splitview',
        label: 'Splitview',
        description:
            'Resizable split panels arranged horizontally or vertically.',
        examples: [
            {
                name: 'basic',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
        ],
    },
    {
        component: 'gridview',
        label: 'Gridview',
        description: 'Grid-based layout with resizable rows and columns.',
        examples: [
            {
                name: 'basic',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
        ],
    },
    {
        component: 'paneview',
        label: 'Paneview',
        description: 'Collapsible accordion-style pane layout.',
        examples: [
            {
                name: 'basic',
                frameworks: ['react', 'vue', 'angular', 'typescript'],
            },
        ],
    },
];

function formatName(name: string): string {
    return name
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function ExampleCard({
    component,
    example,
}: {
    component: string;
    example: Example;
}) {
    const anchorId = `${component}-${example.name}`;
    return (
        <div className="example-card" id={anchorId}>
            <div className="example-card-header">
                <h3 className="example-card-title" id={`${anchorId}-title`}>
                    {formatName(example.name)}
                </h3>
                {example.enterprise && <EnterpriseBadge variant="title" />}
            </div>
            <div className="example-card-frameworks">
                {example.frameworks.map((fw) => {
                    const meta = FRAMEWORK_META[fw];
                    return (
                        <a
                            key={fw}
                            href={`/templates/${component}/${example.name}/${fw}/index.html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="example-fw-link"
                            title={`Open ${formatName(example.name)} in ${meta.label}`}
                        >
                            <img
                                src={useBaseUrl(meta.icon)}
                                width={16}
                                height={16}
                                alt=""
                            />
                            <span>{meta.label}</span>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

function ComponentSection({ group }: { group: ComponentGroup }) {
    return (
        <section className="examples-component-section" id={group.component}>
            <div className="examples-component-header">
                <h2
                    className="examples-component-title"
                    id={`${group.component}-heading`}
                >
                    {group.label}
                </h2>
                <p className="examples-component-description">
                    {group.description}
                </p>
            </div>
            <div className="examples-grid">
                {group.examples.map((ex) => (
                    <ExampleCard
                        key={ex.name}
                        component={group.component}
                        example={ex}
                    />
                ))}
            </div>
        </section>
    );
}

export default function Examples(): JSX.Element {
    return (
        <Layout
            title="Examples"
            description="Browse interactive examples for Dockview, Splitview, Gridview, and Paneview across React, Vue, Angular, and TypeScript."
        >
            <main className="examples-page">
                <div className="container">
                    <div className="examples-hero">
                        <h1>Examples</h1>
                        <p>
                            Interactive examples for every component and
                            framework. Each example opens in its own page where
                            you can view the source or edit in CodeSandbox.
                        </p>
                    </div>
                    {COMPONENTS.map((group) => (
                        <ComponentSection key={group.component} group={group} />
                    ))}
                </div>
            </main>
        </Layout>
    );
}
