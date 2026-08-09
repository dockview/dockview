import React from 'react';
import Layout from '@theme/Layout';
import { useColorMode } from '@docusaurus/theme-common';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { themeConfig } from '../config/theme.config';
import ExampleFrame from '../components/ui/exampleFrame';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { DockviewTheme, themeAbyss, themeLight } from 'dockview-react';
import styles from './demo.module.css';

const CODESANDBOX_URL =
    'https://codesandbox.io/s/github/dockview/dockview/tree/master/packages/docs/sandboxes/react/dockview/demo-dockview';

const updateTheme = (theme: DockviewTheme) => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('theme', theme.name);
    const newUrl = window.location.pathname + '?' + urlParams.toString();
    window.history.pushState({ path: newUrl }, '', newUrl);
};

// The dock theme tracks the site's light/dark mode. Abyss is the flagship dark
// look used across the site; themeLight is its clean light counterpart.
const pairedTheme = (colorMode: 'light' | 'dark'): DockviewTheme =>
    colorMode === 'dark' ? themeAbyss : themeLight;

// Drop an explicit ?theme= choice when we revert to following the site mode, so
// the URL reflects "following the switch" rather than a stale manual pick.
const clearThemeParam = () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.delete('theme');
    const query = urlParams.toString();
    const newUrl = window.location.pathname + (query ? '?' + query : '');
    window.history.replaceState({ path: newUrl }, '', newUrl);
};

// `variant` is locked at mount so rotating mid-session doesn't yank the
// layout out from under the visitor. `?variant=mobile|desktop` forces.
const resolveVariant = (): 'mobile' | 'desktop' => {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('variant');
    if (override === 'mobile' || override === 'desktop') {
        return override;
    }
    return window.matchMedia('(max-width: 600px)').matches
        ? 'mobile'
        : 'desktop';
};

const DemoPage: React.FC = () => {
    const { colorMode } = useColorMode();
    const markSrc = useBaseUrl('/img/brand/dockview-mark.svg');
    const [theme, setTheme] = React.useState<DockviewTheme>(() => {
        // Honour a ?theme= deep link on first load, otherwise start from the
        // theme paired with the current site colour mode.
        const urlParams = new URLSearchParams(window.location.search);
        const themeName = urlParams.get('theme');
        return (
            themeConfig.find((c) => c.id.name === themeName)?.id ??
            pairedTheme(colorMode)
        );
    });
    const [showSidebar, setShowSidebar] = React.useState(false);
    const [ready, setReady] = React.useState(false);
    const variant = React.useMemo(resolveVariant, []);

    // Full-follow: after mount, toggling the site light/dark switch re-syncs the
    // dock theme to the paired theme and drops any explicit ?theme= pick. The
    // mount run is skipped so a deep link survives first load; the picker and
    // theme builder still override freely between toggles.
    const isFirstRender = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const next = pairedTheme(colorMode);
        setTheme(next);
        clearThemeParam();
    }, [colorMode]);

    if (variant === 'mobile') {
        return (
            <MobileDemo
                theme={theme}
                onChangeTheme={(t) => {
                    setTheme(t);
                    updateTheme(t);
                }}
            />
        );
    }

    return (
        <>
            <div className={styles.header}>
                <a
                    href="/"
                    className={styles.backLink}
                    title="Back to dockview.dev"
                >
                    <img
                        className={styles.brandMark}
                        src={markSrc}
                        alt=""
                        width={20}
                        height={20}
                    />
                    <span className={styles.wordmark}>dockview</span>
                </a>
                <div className={styles.spacer} />
                <div className={styles.tip}>
                    <span className={styles.kbd}>Shift</span>
                    <span>+ click a tab to float it</span>
                </div>
                <div className={styles.spacer} />
                <button
                    type="button"
                    className={styles.iconButton}
                    title="View mobile demo"
                    aria-label="View mobile demo"
                    onClick={switchToMobileVariant}
                >
                    <svg
                        height="16"
                        width="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect x="7" y="2" width="10" height="20" rx="2" />
                        <path d="M11 18h2" />
                    </svg>
                </button>
                <a
                    href={CODESANDBOX_URL}
                    target="_blank"
                    rel="noopener"
                    className={styles.iconButton}
                    title="Open in CodeSandbox"
                >
                    <svg
                        height="16"
                        width="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M2 6l10-6 10 6v12l-10 6L2 18V6zm2 1.5v9l8 4.8 8-4.8v-9L12 3.2 4 7.5z" />
                    </svg>
                </a>
                <div className={styles.divider} />
                <ThemeSelector
                    value={theme.name}
                    options={themeConfig.map((t) => ({
                        value: t.id.name,
                        label: t.label,
                    }))}
                    onChanged={(value) => {
                        const newTheme =
                            themeConfig.find((theme) => theme.id.name === value)
                                ?.id ?? themeAbyss;
                        setTheme(newTheme);
                        updateTheme(newTheme);
                    }}
                />
                <div className={styles.divider} />
                <button
                    className={`${styles.toggleButton} ${
                        showSidebar ? styles.toggleButtonActive : ''
                    }`}
                    title={showSidebar ? 'Close panel' : 'Open controls & theme'}
                    aria-pressed={showSidebar}
                    onClick={() => setShowSidebar((v) => !v)}
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <line x1="4" y1="21" x2="4" y2="14" />
                        <line x1="4" y1="10" x2="4" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12" y2="3" />
                        <line x1="20" y1="21" x2="20" y2="16" />
                        <line x1="20" y1="12" x2="20" y2="3" />
                        <line x1="1" y1="14" x2="7" y2="14" />
                        <line x1="9" y1="8" x2="15" y2="8" />
                        <line x1="17" y1="16" x2="23" y2="16" />
                    </svg>
                    Controls &amp; Theme
                </button>
            </div>
            <div className={styles.demoBody}>
                <ExampleFrame
                    theme={theme}
                    framework="react"
                    height="100%"
                    id="dockview/demo-dockview"
                    extraProps={{
                        showSidebar,
                        onCloseSidebar: () => setShowSidebar(false),
                        onChangeTheme: (t: DockviewTheme) => {
                            setTheme(t);
                            updateTheme(t);
                        },
                        onReady: () => setReady(true),
                    }}
                />
                <DemoLoader visible={!ready} />
            </div>
        </>
    );
};

const DemoLoader: React.FC<{ visible: boolean }> = ({ visible }) => {
    const src = useBaseUrl('/img/brand/dockview-loader-dock.svg');
    return (
        <div
            className={`${styles.loader}${
                visible ? '' : ' ' + styles.loaderHidden
            }`}
            role="status"
            aria-label="Loading demo"
            aria-hidden={!visible}
        >
            <img src={src} alt="" width={96} height={96} />
        </div>
    );
};

const MobileDemo: React.FC<{
    theme: DockviewTheme;
    onChangeTheme: (theme: DockviewTheme) => void;
}> = ({ theme, onChangeTheme }) => {
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [ready, setReady] = React.useState(false);

    return (
        <>
            <div className={styles.mobileHeader}>
                <a
                    href="/"
                    className={styles.mobileButton}
                    aria-label="Back to dockview.dev"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                </a>
                <div className={styles.mobileTip}>
                    Long-press a tab, then drag
                </div>
                <button
                    type="button"
                    className={styles.mobileButton}
                    onClick={switchToDesktopVariant}
                    aria-label="View desktop demo"
                    title="View desktop demo"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <rect x="2" y="4" width="20" height="13" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                    </svg>
                </button>
                <button
                    type="button"
                    className={styles.mobileButton}
                    onClick={() => setSheetOpen(true)}
                    aria-label="Change theme"
                    title="Change theme"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 3a9 9 0 0 0 0 18 6 6 0 1 1 0-12 3 3 0 1 1 0-6z" />
                    </svg>
                </button>
            </div>
            <div className={styles.demoBody}>
                <ExampleFrame
                    theme={theme}
                    framework="react"
                    height="100%"
                    id="dockview/demo-dockview-mobile"
                    extraProps={{ onReady: () => setReady(true) }}
                />
                <DemoLoader visible={!ready} />
            </div>
            {sheetOpen && (
                <ThemeBottomSheet
                    activeTheme={theme}
                    onSelect={(t) => {
                        onChangeTheme(t);
                        setSheetOpen(false);
                    }}
                    onClose={() => setSheetOpen(false)}
                />
            )}
        </>
    );
};

const switchToDesktopVariant = () => {
    // Preserve the current theme so the visitor sees the same look in the
    // desktop variant they chose on mobile. Reload because `variant` is
    // locked at mount.
    const params = new URLSearchParams(window.location.search);
    params.set('variant', 'desktop');
    window.location.search = params.toString();
};

const switchToMobileVariant = () => {
    const params = new URLSearchParams(window.location.search);
    params.set('variant', 'mobile');
    window.location.search = params.toString();
};

const ThemeBottomSheet: React.FC<{
    activeTheme: DockviewTheme;
    onSelect: (theme: DockviewTheme) => void;
    onClose: () => void;
}> = ({ activeTheme, onSelect, onClose }) => {
    // Close on escape so non-touch testers can dismiss without tapping
    // the backdrop.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <>
            <div
                className={styles.sheetBackdrop}
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                className={styles.sheet}
                role="dialog"
                aria-label="Choose theme"
            >
                <div className={styles.sheetGrabber} />
                <div className={styles.sheetTitle}>Theme</div>
                {themeConfig.map((t) => {
                    const active = t.id.name === activeTheme.name;
                    return (
                        <button
                            key={t.id.name}
                            type="button"
                            className={`${styles.sheetItem} ${
                                active ? styles.sheetItemActive : ''
                            }`}
                            onClick={() => onSelect(t.id)}
                        >
                            <span>{t.label}</span>
                            {active && <span>✓</span>}
                        </button>
                    );
                })}
            </div>
        </>
    );
};

export default function Demo() {
    // The site navbar is removed for this route by the Navbar swizzle
    // (src/theme/Navbar), so /demo is a full-bleed application shell. The
    // dv-demo-route class (see custom.scss) makes #__docusaurus a viewport-height
    // flex column so this fills the space left by the announcement bar without a
    // page scrollbar.
    React.useEffect(() => {
        document.documentElement.classList.add('dv-demo-route');
        return () =>
            document.documentElement.classList.remove('dv-demo-route');
    }, []);

    return (
        <Layout noFooter={true}>
            <div
                style={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <BrowserOnly>{() => <DemoPage />}</BrowserOnly>
            </div>
        </Layout>
    );
}

import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu';

const ThemeSelector = (props: {
    options: { value: string; label: string }[];
    value: string;
    onChanged: (value: string) => void;
}) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const selectedLabel =
        props.options.find((o) => o.value === props.value)?.label ??
        props.value;

    return (
        <div ref={ref}>
            <DropdownMenu
                onOpenChange={(open) => {
                    if (!open) {
                        return;
                    }

                    if (!ref.current) {
                        return;
                    }

                    requestAnimationFrame(() => {
                        const el = ref.current!.querySelector(
                            `[data-dropdown-menu-value="${props.value}"]`
                        );
                        if (el) {
                            (el as HTMLElement).focus();
                        }
                    });
                }}
            >
                <DropdownMenuTrigger asChild={true}>
                    <div className="framework-menu-item-select">
                        {selectedLabel}
                    </div>
                </DropdownMenuTrigger>
                {/* Portal to document.body so the fixed popper wrapper lands
                    in the root stacking context. Without it the wrapper is
                    trapped in an ancestor context the dockview paints above, so
                    the menu appears behind the resize sashes despite its high
                    z-index. */}
                <DropdownMenuPortal>
                    <DropdownMenuContent
                        side="bottom"
                        align="end"
                        sideOffset={10}
                        className="DropdownMenuContent"
                        style={{ zIndex: 100000 }}
                    >
                        {props.options.map((option) => {
                            return (
                                <DropdownMenuItem
                                    data-dropdown-menu-value={option.value}
                                    onClick={() =>
                                        props.onChanged(option.value)
                                    }
                                    className="DropdownMenuItem"
                                >
                                    <div className="framework-menu-item">
                                        <span>{option.label}</span>
                                        <span>
                                            {option.value === props.value
                                                ? '✓'
                                                : ''}
                                        </span>
                                    </div>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenuPortal>
            </DropdownMenu>
        </div>
    );
};
