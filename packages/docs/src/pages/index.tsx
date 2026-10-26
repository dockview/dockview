import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import './index.scss';

// ─── Animated framework name ──────────────────────────────────────────────────

const FRAMEWORKS: { label: string; color: string }[] = [
    { label: 'React', color: '#61dafb' },
    { label: 'Vue', color: '#42b883' },
    { label: 'Angular', color: '#dd0031' },
    { label: 'JavaScript', color: '#f7df1e' },
];

const FRAMEWORK_LINKS: { label: string; icon: string; param: string }[] = [
    { label: 'React', icon: 'img/react-icon.svg', param: 'react' },
    { label: 'Vue', icon: 'img/vue-icon.svg', param: 'vue' },
    { label: 'Angular', icon: 'img/angular-icon.svg', param: 'angular' },
    { label: 'JavaScript', icon: 'img/js-icon.svg', param: 'javascript' },
];

// ─── Latest release ───────────────────────────────────────────────────────────

// Bump on each major, alongside the `RELEASES` array in whats-new.tsx. Links
// straight at the release notes rather than the /whats-new index so the pill
// lands on the actual content in one click.
const LATEST_VERSION = 'v8.0';
const LATEST_RELEASE_NOTES = '/docs/releases/whats-new/whats-new-v8';

function HeroRelease() {
    return (
        <Link to={LATEST_RELEASE_NOTES} className="hero-release">
            <span className="hero-release-chip">{LATEST_VERSION}</span>
            <span>What's new</span>
            <span className="hero-release-arrow" aria-hidden="true">
                →
            </span>
        </Link>
    );
}

// ─── Social proof stats ───────────────────────────────────────────────────────

const STATS: { value: string; label: string; href?: string }[] = [
    {
        value: '3.3k+',
        label: 'GitHub stars',
        href: 'https://github.com/dockview/dockview',
    },
    {
        value: '540k+',
        label: 'monthly downloads',
        href: 'https://www.npmjs.com/package/dockview-core',
    },
    { value: '0', label: 'dependencies' },
    { value: '4', label: 'frameworks' },
];

function HeroStats() {
    return (
        <ul className="hero-stats">
            {STATS.map((stat) => {
                const inner = (
                    <>
                        <span className="hero-stat-value">{stat.value}</span>
                        <span className="hero-stat-label">{stat.label}</span>
                    </>
                );
                return (
                    <li key={stat.label} className="hero-stat">
                        {stat.href ? (
                            <a
                                href={stat.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hero-stat-link"
                            >
                                {inner}
                            </a>
                        ) : (
                            inner
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function AnimatedFramework() {
    const [index, setIndex] = React.useState(0);

    React.useEffect(() => {
        const id = setInterval(
            () => setIndex((i) => (i + 1) % FRAMEWORKS.length),
            2200
        );
        return () => clearInterval(id);
    }, []);

    const { label, color } = FRAMEWORKS[index];

    return (
        <span key={index} className="hero-framework" style={{ color }}>
            {label}
        </span>
    );
}

// ─── Framework logos ──────────────────────────────────────────────────────────

function Frameworks() {
    const frameworks = [
        { name: 'React', pkg: 'dockview-react', logo: '/img/react-icon.svg' },
        { name: 'Vue', pkg: 'dockview-vue', logo: '/img/vue-icon.svg' },
        {
            name: 'Angular',
            pkg: 'dockview-angular',
            logo: '/img/angular-icon.svg',
        },
        {
            name: 'TypeScript',
            pkg: 'dockview',
            logo: '/img/js-icon.svg',
        },
    ];

    return (
        <section className="frameworks-section">
            <div className="container">
                <p className="section-label">Framework support</p>
                <div className="frameworks-grid">
                    {frameworks.map((fw) => (
                        <div key={fw.name} className="framework-item">
                            <img
                                src={useBaseUrl(fw.logo)}
                                alt={fw.name}
                                className="framework-logo"
                            />
                            <span className="framework-name">{fw.name}</span>
                            <code className="framework-pkg">{fw.pkg}</code>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── Page sections ────────────────────────────────────────────────────────────

function Hero() {
    return (
        <section className="hero-section">
            <div className="container">
                <div className="hero-text">
                    <h1 className="hero-headline">
                        The docking layout manager for <AnimatedFramework />
                    </h1>
                    <p className="hero-subtitle">
                        Build IDE-like interfaces with tabs, groups, drag &
                        drop, floating panels, and popout windows. Touch and
                        mobile ready. Zero dependencies.
                    </p>
                    <div className="hero-actions">
                        <HeroRelease />
                        <div className="hero-fw-btns">
                            {FRAMEWORK_LINKS.map((fw) => (
                                <Link
                                    key={fw.label}
                                    to={`/docs/overview/quickstart?framework=${fw.param}`}
                                    className="hero-fw-btn"
                                >
                                    <img
                                        src={useBaseUrl(fw.icon)}
                                        width={16}
                                        height={16}
                                        alt=""
                                    />
                                    {fw.label}
                                </Link>
                            ))}
                        </div>
                        <Link
                            to="/demo"
                            className="button button--primary button--lg"
                        >
                            Live Demo →
                        </Link>
                    </div>
                    <HeroStats />
                </div>
                <Link
                    to="/demo"
                    className="hero-preview"
                    aria-label="Open the live demo"
                >
                    <img
                        src={useBaseUrl('/img/demo-hero.webp')}
                        alt="Dockview trading dashboard demo in the Abyss theme"
                        className="hero-gif"
                    />
                    <span className="hero-preview-badge">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Try the live demo
                    </span>
                </Link>
            </div>
        </section>
    );
}

function CallToAction() {
    return (
        <section className="cta-section">
            <div className="container cta-inner">
                <p className="section-label">Get started</p>
                <h2 className="cta-title">Drop dockview into your app</h2>
                <p className="cta-subtitle">
                    Install the package for your framework and render your first
                    layout in minutes.
                </p>
                <div className="cta-install">
                    <code>npm install dockview</code>
                </div>
                <div className="cta-actions">
                    <Link
                        to="/docs/overview/introduction"
                        className="button button--primary button--lg"
                    >
                        Read the docs →
                    </Link>
                    <Link
                        to="/demo"
                        className="button button--secondary button--lg"
                    >
                        Live demo
                    </Link>
                    <Link
                        to="/trial"
                        className="button button--secondary button--lg"
                    >
                        Start free trial
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
    return (
        <Layout
            title="Docking Layout Manager"
            description="Dockview is a zero dependency docking layout manager for building IDE-like interfaces with tabs, groups, grids, splitviews, drag and drop, floating panels, and popout windows. Touch and mobile ready. Supports React, Vue, Angular, and vanilla TypeScript."
        >
            <main>
                <Hero />
                <Frameworks />
                <CallToAction />
            </main>
        </Layout>
    );
}
