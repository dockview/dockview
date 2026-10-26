import React from 'react';

// Anonymous page feedback: a one-click thumbs up/down reaction plus an optional
// freeform message box. They ship as two components, given the same id:
// <BlogReaction> for the top of a post, where every reader passes it, and
// <BlogFeedback> for the end, which repeats the vote for anyone who waited until
// they'd read the argument and follows it with the message form. Voting in either
// box locks both (see the subscriber registry below).
//
// Both talk to the licensing worker's feedback API (the same worker that serves
// /enterprise), and both are gated by Cloudflare Turnstile using interaction-only
// widgets that stay invisible and mint a token in the background, only surfacing
// if a visitor actually has to be challenged. So a vote stays one click and the
// message box has no visible bot-check. Each action keeps its own widget (tokens
// are single-use, so one can't cover both).
//
// The running score is private: nothing here reads or displays the tallies, which
// are visible only on the worker's /admin dashboard. All a visitor sees is
// whether they personally reacted, kept client-side in localStorage.

// Public Turnstile site key (safe to expose, it's rendered into the page). The
// matching secret lives only in the licensing worker (TURNSTILE_SECRET_KEY).
const TURNSTILE_SITE_KEY = '0x4AAAAAADx1eYe1Ro1u3YUq';
// Cloudflare's visible "always passes" test key, used on localhost so local dev
// doesn't depend on the real widget's domain allowlist.
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_SCRIPT =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const VOTED_KEY_PREFIX = 'dockview-feedback-voted:';

type Vote = 'up' | 'down';

function isLocalhost(): boolean {
    return (
        typeof window !== 'undefined' &&
        window.location.hostname === 'localhost'
    );
}

function turnstileSiteKey(): string {
    return isLocalhost() ? TURNSTILE_TEST_SITE_KEY : TURNSTILE_SITE_KEY;
}

// The feedback API lives on the licensing worker under /enterprise, same origin
// as the docs site in production; in local dev the worker runs on :4000.
function feedbackApiUrl(path: string): string {
    const base = isLocalhost() ? 'http://localhost:4000/enterprise' : '/enterprise';
    return `${base}/api/feedback/${path}`;
}

// Remember whether this browser already reacted to a given feedback id, so the
// counter locks to one vote per browser. Honour-based: the tallies live in a
// single shared counter server-side with no per-voter record, so this is the
// only dedup. Best-effort (a no-op if storage is unavailable, e.g. private mode).
function getVoted(id: string): Vote | null {
    try {
        const v = window.localStorage.getItem(VOTED_KEY_PREFIX + id);
        return v === 'up' || v === 'down' ? v : null;
    } catch {
        return null;
    }
}

function setVoted(id: string, vote: Vote): void {
    try {
        window.localStorage.setItem(VOTED_KEY_PREFIX + id, vote);
    } catch {
        /* ignore */
    }
}

// A page can show the same feedback id in more than one place (a reaction box at
// the top of a post and another at the end). Each keeps its own React state, so a
// vote cast in one has to be announced to the others or they would sit there
// looking unvoted until the next reload. Storage events don't help: the browser
// doesn't fire them in the tab that wrote the value. So mounted widgets subscribe
// here by id and the writer publishes to them directly.
const voteSubscribers = new Map<string, Set<(vote: Vote) => void>>();

function subscribeToVote(id: string, fn: (vote: Vote) => void): () => void {
    let subscribers = voteSubscribers.get(id);
    if (!subscribers) {
        subscribers = new Set();
        voteSubscribers.set(id, subscribers);
    }
    subscribers.add(fn);
    return () => {
        subscribers.delete(fn);
        if (subscribers.size === 0) voteSubscribers.delete(id);
    };
}

function publishVote(id: string, vote: Vote): void {
    voteSubscribers.get(id)?.forEach((fn) => fn(vote));
}

declare global {
    interface Window {
        turnstile?: {
            render: (
                el: HTMLElement,
                opts: {
                    sitekey: string;
                    appearance?: 'always' | 'execute' | 'interaction-only';
                    callback: (token: string) => void;
                    'expired-callback'?: () => void;
                    'error-callback'?: () => void;
                }
            ) => string;
            reset: (id?: string) => void;
            remove: (id?: string) => void;
        };
    }
}

// Load the Turnstile script once and render a widget, exposing its token. The
// managed widget is mostly automatic: with appearance 'interaction-only' it
// stays invisible and issues a token in the background unless a real challenge
// is needed. Tokens are single-use, so `reset` fetches a fresh one after a token
// is spent, and `remove` retires the widget once no further token will be needed.
// Multiple widgets can coexist on a page; each tracks its own id.
function useTurnstileToken(appearance?: 'interaction-only'): {
    token: string;
    widgetRef: React.RefObject<HTMLDivElement>;
    reset: () => void;
    remove: () => void;
} {
    const [token, setToken] = React.useState('');
    const widgetRef = React.useRef<HTMLDivElement>(null);
    const widgetIdRef = React.useRef<string | null>(null);
    const renderedRef = React.useRef(false);

    React.useEffect(() => {
        function render() {
            if (renderedRef.current || !widgetRef.current || !window.turnstile)
                return;
            renderedRef.current = true;
            widgetIdRef.current = window.turnstile.render(widgetRef.current, {
                sitekey: turnstileSiteKey(),
                appearance,
                callback: setToken,
                'expired-callback': () => setToken(''),
                'error-callback': () => setToken(''),
            });
        }

        if (window.turnstile) {
            render();
            return;
        }
        const existing = document.querySelector<HTMLScriptElement>(
            `script[src="${TURNSTILE_SCRIPT}"]`
        );
        const script = existing ?? document.createElement('script');
        script.src = TURNSTILE_SCRIPT;
        script.async = true;
        script.defer = true;
        script.addEventListener('load', render);
        if (!existing) document.head.appendChild(script);
        return () => script.removeEventListener('load', render);
    }, [appearance]);

    // Retire the widget. Turnstile holds its own reference to the container, so a
    // widget whose node React has since dropped (the message box swaps the form
    // for a thank-you, and docs navigation is a SPA) would otherwise keep
    // refreshing against a detached node and log "Cannot find Widget".
    const remove = React.useCallback(() => {
        if (widgetIdRef.current === null) return;
        try {
            window.turnstile?.remove(widgetIdRef.current);
        } catch {
            /* ignore */
        }
        widgetIdRef.current = null;
        renderedRef.current = false;
        setToken('');
    }, []);

    // Also retire it if the host unmounts with the widget still live.
    React.useEffect(() => remove, [remove]);

    const reset = React.useCallback(() => {
        try {
            window.turnstile?.reset(widgetIdRef.current ?? undefined);
        } catch {
            /* ignore */
        }
        setToken('');
    }, []);

    return { token, widgetRef, reset, remove };
}

function ThumbIcon({ down }: { down?: boolean }): JSX.Element {
    // A single thumbs-up path, flipped for the down variant.
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ transform: down ? 'rotate(180deg)' : undefined }}
        >
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
    );
}

function Votes({ id }: { id: string }): JSX.Element {
    const [mine, setMine] = React.useState<Vote | null>(null);
    const [busy, setBusy] = React.useState(false);
    // A vote clicked before Turnstile has issued a token, held until it lands.
    const [pending, setPending] = React.useState<Vote | null>(null);
    // Invisible unless a challenge is needed, so a vote stays one click.
    const { token, widgetRef, reset, remove } = useTurnstileToken(
        'interaction-only'
    );

    // Whether this browser already reacted. The tallies are deliberately not
    // fetched: they're private to the admin dashboard, so there is nothing to
    // show here and no public read to make. Staying subscribed keeps a second
    // box for the same id in step when the other one is used.
    React.useEffect(() => {
        setMine(getVoted(id));
        return subscribeToVote(id, (vote) => {
            setMine(vote);
            // Another box spent the vote, so this widget's token never will be.
            remove();
        });
    }, [id, remove]);

    // Send the vote once a Turnstile token is in hand.
    const send = React.useCallback(
        async (vote: Vote) => {
            let landed = false;
            try {
                const res = await fetch(feedbackApiUrl('vote'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, vote, turnstileToken: token }),
                });
                if (res.ok) {
                    setVoted(id, vote);
                    // Sets our own `mine` too, via the subscription above.
                    publishVote(id, vote);
                    landed = true;
                }
            } catch {
                /* swallow — the buttons unlock and the visitor can retry */
            } finally {
                // The token is spent either way. Once the vote lands this browser
                // is locked out, so retire the widget rather than have it solve
                // another challenge nobody will spend; on failure swap in a fresh
                // token so a retry can go through.
                if (landed) remove();
                else reset();
                setBusy(false);
            }
        },
        [id, token, reset, remove]
    );

    // A click made before the token arrived fires the moment it does.
    React.useEffect(() => {
        if (pending && token) {
            const vote = pending;
            setPending(null);
            void send(vote);
        }
    }, [pending, token, send]);

    // One click adds to a tally the visitor never sees. One vote per browser
    // (remembered in localStorage), so once you've reacted the buttons lock in.
    function cast(vote: Vote) {
        if (busy || mine) return;
        setBusy(true);
        if (token) void send(vote);
        else setPending(vote);
    }

    const voted = mine !== null;

    const btn = (active: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 8,
        border: `1px solid ${
            active ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-300)'
        }`,
        background: active
            ? 'var(--ifm-color-primary)'
            : 'var(--ifm-background-color)',
        color: active ? '#fff' : 'var(--ifm-font-color-base)',
        font: 'inherit',
        fontSize: '0.9rem',
        cursor: busy || voted ? 'default' : 'pointer',
        opacity: voted && !active ? 0.6 : 1,
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <span style={{ fontWeight: 600 }}>
                    Is this a positive change?
                </span>
                <button
                    type="button"
                    onClick={() => cast('up')}
                    disabled={busy || voted}
                    aria-pressed={mine === 'up'}
                    aria-label="Yes, this is a positive change"
                    style={btn(mine === 'up')}
                >
                    <ThumbIcon />
                    <span>Yes</span>
                </button>
                <button
                    type="button"
                    onClick={() => cast('down')}
                    disabled={busy || voted}
                    aria-pressed={mine === 'down'}
                    aria-label="No, this is not a positive change"
                    style={btn(mine === 'down')}
                >
                    <ThumbIcon down />
                    <span>No</span>
                </button>
                {voted && (
                    <span
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--ifm-color-content-secondary)',
                        }}
                    >
                        Thanks!
                    </span>
                )}
            </div>
            {/* Invisible unless Turnstile needs to challenge the visitor. */}
            <div ref={widgetRef} />
        </div>
    );
}

type MessageStatus = 'idle' | 'submitting' | 'done' | 'error';

function inputStyle(hasError: boolean): React.CSSProperties {
    return {
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${
            hasError
                ? 'var(--ifm-color-danger)'
                : 'var(--ifm-color-emphasis-300)'
        }`,
        background: 'var(--ifm-background-color)',
        color: 'var(--ifm-font-color-base)',
        fontSize: '0.95rem',
        fontFamily: 'inherit',
    };
}

function labelStyle(): React.CSSProperties {
    return {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: 600,
        marginBottom: 6,
        color: 'var(--ifm-heading-color)',
    };
}

function optional(): JSX.Element {
    return (
        <span
            style={{
                color: 'var(--ifm-color-content-secondary)',
                fontWeight: 400,
            }}
        >
            {' '}
            (optional)
        </span>
    );
}

function MessageBox({ id }: { id: string }): JSX.Element {
    const [message, setMessage] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [company, setCompany] = React.useState('');
    const [error, setError] = React.useState('');
    const [status, setStatus] = React.useState<MessageStatus>('idle');
    // A submit made before Turnstile has issued its token, held until it lands.
    const [pendingSubmit, setPendingSubmit] = React.useState(false);
    // Interaction-only, so nothing shows unless a challenge is actually needed.
    const { token, widgetRef, reset, remove } = useTurnstileToken(
        'interaction-only'
    );

    const doSubmit = React.useCallback(
        async (turnstileToken: string) => {
            setStatus('submitting');
            setError('');
            try {
                const res = await fetch(feedbackApiUrl('message'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id,
                        message: message.trim(),
                        email: email.trim().toLowerCase() || undefined,
                        company: company.trim() || undefined,
                        turnstileToken,
                    }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(
                        data.error ?? 'Something went wrong. Please try again.'
                    );
                }
                // Retire the widget while its container is still mounted: the
                // 'done' branch below replaces the whole form with a thank-you.
                remove();
                setStatus('done');
            } catch (err) {
                setStatus('error');
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Something went wrong. Please try again.'
                );
                reset();
            }
        },
        [id, message, email, company, reset, remove]
    );

    // A submit queued before the token arrived fires the moment it does.
    React.useEffect(() => {
        if (pendingSubmit && token) {
            setPendingSubmit(false);
            void doSubmit(token);
        }
    }, [pendingSubmit, token, doSubmit]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!message.trim()) {
            setError('Please enter a message.');
            return;
        }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setError('Please enter a valid email address, or leave it blank.');
            return;
        }
        setError('');
        // The token is minted in the background. Send now if it's ready, else
        // show the sending state and fire the moment it lands.
        if (token) {
            void doSubmit(token);
        } else {
            setStatus('submitting');
            setPendingSubmit(true);
        }
    }

    if (status === 'done') {
        return (
            <p
                style={{
                    margin: 0,
                    color: 'var(--ifm-color-content-secondary)',
                }}
            >
                Thanks for the feedback. We read every message.
            </p>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
            <label style={{ display: 'block' }}>
                <span style={labelStyle()}>Leave a message</span>
                <textarea
                    value={message}
                    rows={4}
                    placeholder="What did you think? What would you like to see next?"
                    onChange={(e) => {
                        setMessage(e.target.value);
                        setError('');
                    }}
                    style={{ ...inputStyle(false), resize: 'vertical' }}
                />
            </label>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                }}
            >
                <label style={{ display: 'block' }}>
                    <span style={labelStyle()}>Email{optional()}</span>
                    <input
                        type="email"
                        value={email}
                        placeholder="jane@acme.com"
                        onChange={(e) => setEmail(e.target.value)}
                        style={inputStyle(false)}
                    />
                </label>
                <label style={{ display: 'block' }}>
                    <span style={labelStyle()}>Company{optional()}</span>
                    <input
                        type="text"
                        value={company}
                        placeholder="Acme Corp"
                        onChange={(e) => setCompany(e.target.value)}
                        style={inputStyle(false)}
                    />
                </label>
            </div>

            <div ref={widgetRef} />

            {error && (
                <div
                    style={{
                        color: 'var(--ifm-color-danger)',
                        fontSize: '0.9rem',
                    }}
                >
                    {error}
                </div>
            )}

            <div>
                <button
                    type="submit"
                    className="button button--primary"
                    disabled={status === 'submitting'}
                >
                    {status === 'submitting' ? 'Sending…' : 'Send feedback'}
                </button>
            </div>
            <p
                style={{
                    fontSize: '0.8rem',
                    color: 'var(--ifm-color-content-secondary)',
                    margin: 0,
                }}
            >
                Leave your email only if you'd like a reply. By submitting you
                agree to our <a href="/enterprise/privacy">privacy policy</a>.
            </p>
        </form>
    );
}

// The anchor the reaction box links down to, so a reader who wants to say more
// than a thumb can jump straight to the message form.
const MESSAGE_ANCHOR = 'feedback';

// The `id` prop keys the feedback (the vote tally, and the tag on each message)
// so one widget can serve several pages, e.g. id="v8-feedback". Defaults to the
// current path when omitted. Returns '' until a key is known, which holds the
// API call back during the first client render when no prop was given.
function useFeedbackId(id?: string): string {
    const [resolvedId, setResolvedId] = React.useState(id ?? '');

    React.useEffect(() => {
        if (!id && typeof window !== 'undefined') {
            setResolvedId(window.location.pathname);
        }
    }, [id]);

    return id ?? resolvedId;
}

function cardStyle(padding: string): React.CSSProperties {
    return {
        border: '1px solid var(--ifm-color-emphasis-200)',
        borderRadius: 12,
        padding,
        background: 'var(--ifm-card-background-color)',
    };
}

// The reaction box, meant for the top of a post: a one-click read on how people
// feel about what they've just read, plus a pointer to the message form at the
// end for anyone with more to say. Pair it with <BlogFeedback> on the same id.
export function BlogReaction({ id }: { id?: string }): JSX.Element {
    const key = useFeedbackId(id);

    return (
        <div
            style={{
                ...cardStyle('20px 24px'),
                marginBottom: 32,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}
        >
            {key && <Votes id={key} />}
            <p
                style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    color: 'var(--ifm-color-content-secondary)',
                }}
            >
                Got more to say?{' '}
                <a href={`#${MESSAGE_ANCHOR}`}>Leave a message at the end</a>.
            </p>
        </div>
    );
}

// The closing section, meant for the end of a post: the same vote again for
// anyone who waited until they'd read the argument, then the message form. Shares
// its id with <BlogReaction>, so voting in either box locks both.
export function BlogFeedback({ id }: { id?: string }): JSX.Element {
    const key = useFeedbackId(id);

    return (
        <section
            style={{
                ...cardStyle('28px'),
                marginTop: 48,
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
            }}
        >
            {key && <Votes id={key} />}
            <hr
                style={{
                    margin: 0,
                    border: 0,
                    borderTop: '1px solid var(--ifm-color-emphasis-200)',
                }}
            />
            {/* The anchor sits on the form, not the section, so the reaction
                box's "leave a message" link lands on what it promises rather
                than on the vote. scrollMarginTop clears the sticky navbar. */}
            <div
                id={MESSAGE_ANCHOR}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    scrollMarginTop: 90,
                }}
            >
                <h3 style={{ margin: '0 0 4px' }}>Send us feedback</h3>
                <p
                    style={{
                        margin: '0 0 12px',
                        color: 'var(--ifm-color-content-secondary)',
                    }}
                >
                    Tell us what you make of the change, or ask a question.
                </p>
                {key && <MessageBox id={key} />}
            </div>
        </section>
    );
}

export default BlogFeedback;
