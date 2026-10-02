import React from 'react';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import styles from './NewsletterWidget.module.css';

const MailIcon = () => (
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
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <polyline points="2,4 12,13 22,4" />
    </svg>
);

const CloseIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const DISMISS_KEY = 'dv-newsletter-dismissed';

// Full-screen tool pages where the floating button would cover the workspace.
const HIDDEN_ON = ['/theme-builder'];

export default function NewsletterWidget() {
    // Start hidden during SSR / first paint, then reveal only if the visitor
    // hasn't previously dismissed it. This avoids a flash on dismissed sessions.
    const [hidden, setHidden] = React.useState(true);
    const { pathname } = useLocation();

    React.useEffect(() => {
        try {
            setHidden(localStorage.getItem(DISMISS_KEY) === 'true');
        } catch {
            setHidden(false);
        }
    }, []);

    const dismiss = () => {
        setHidden(true);
        try {
            localStorage.setItem(DISMISS_KEY, 'true');
        } catch {
            /* storage unavailable, so the dismissal won't persist */
        }
    };

    if (hidden || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

    return (
        <div className={styles.wrapper}>
            <Link
                to="/newsletter"
                className={styles.trigger}
                aria-label="Newsletter signup"
            >
                <MailIcon />
                <span>Newsletter</span>
            </Link>
            <button
                className={styles.dismiss}
                onClick={dismiss}
                aria-label="Dismiss newsletter"
            >
                <CloseIcon />
            </button>
        </div>
    );
}
