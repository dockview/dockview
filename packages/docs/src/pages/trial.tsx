import React from 'react';
import Layout from '@theme/Layout';

// Public Turnstile site key (safe to expose, it's rendered into the page). The
// matching secret lives only in the licensing worker (TURNSTILE_SECRET_KEY).
const TURNSTILE_SITE_KEY = '0x4AAAAAADx1eYe1Ro1u3YUq';

// Cloudflare's visible "always passes" test site key. Used on localhost so
// local dev doesn't depend on the real widget's domain allowlist or network.
// Pair it with the matching test secret in the worker's .dev.vars.
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

function turnstileSiteKey(): string {
    if (
        typeof window !== 'undefined' &&
        window.location.hostname === 'localhost'
    ) {
        return TURNSTILE_TEST_SITE_KEY;
    }
    return TURNSTILE_SITE_KEY;
}

const TURNSTILE_SCRIPT =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// The trial API lives on the licensing worker under /enterprise. Same origin
// as the docs site in production; in local dev the worker runs on :4000.
function trialApiUrl(): string {
    if (
        typeof window !== 'undefined' &&
        window.location.hostname === 'localhost'
    ) {
        return 'http://localhost:4000/enterprise/api/trial';
    }
    return '/enterprise/api/trial';
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

interface FormState {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
}

type Status = 'idle' | 'submitting' | 'done' | 'error';

function Field(props: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    required?: boolean;
    error?: string;
}) {
    return (
        <label style={{ display: 'block' }}>
            <span
                style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 6,
                    color: 'var(--ifm-heading-color)',
                }}
            >
                {props.label}
                {!props.required && (
                    <span
                        style={{
                            color: 'var(--ifm-color-content-secondary)',
                            fontWeight: 400,
                        }}
                    >
                        {' '}
                        (optional)
                    </span>
                )}
            </span>
            <input
                type={props.type ?? 'text'}
                value={props.value}
                placeholder={props.placeholder}
                onChange={(e) => props.onChange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${
                        props.error
                            ? 'var(--ifm-color-danger)'
                            : 'var(--ifm-color-emphasis-300)'
                    }`,
                    background: 'var(--ifm-background-color)',
                    color: 'var(--ifm-font-color-base)',
                    fontSize: '0.95rem',
                }}
            />
            {props.error && (
                <span
                    style={{
                        display: 'block',
                        color: 'var(--ifm-color-danger)',
                        fontSize: '0.8rem',
                        marginTop: 4,
                    }}
                >
                    {props.error}
                </span>
            )}
        </label>
    );
}

function TrialForm() {
    const [form, setForm] = React.useState<FormState>({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
    });
    const [errors, setErrors] = React.useState<Partial<FormState>>({});
    const [status, setStatus] = React.useState<Status>('idle');
    const [message, setMessage] = React.useState('');
    const [token, setToken] = React.useState('');
    const widgetRef = React.useRef<HTMLDivElement>(null);
    const renderedRef = React.useRef(false);

    // Load the Turnstile script once and render the widget explicitly.
    React.useEffect(() => {
        function render() {
            if (renderedRef.current || !widgetRef.current || !window.turnstile)
                return;
            renderedRef.current = true;
            window.turnstile.render(widgetRef.current, {
                sitekey: turnstileSiteKey(),
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
    }, []);

    function update(key: keyof FormState, value: string) {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    }

    function validate(): boolean {
        const next: Partial<FormState> = {};
        if (!form.firstName.trim()) next.firstName = 'First name is required.';
        if (!form.lastName.trim()) next.lastName = 'Last name is required.';
        if (!form.email.trim()) next.email = 'Email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
            next.email = 'Please enter a valid email address.';
        setErrors(next);
        return Object.keys(next).length === 0;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!validate()) return;
        if (!token) {
            setStatus('error');
            setMessage('Please complete the bot check and try again.');
            return;
        }

        setStatus('submitting');
        setMessage('');
        try {
            const res = await fetch(trialApiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim().toLowerCase(),
                    company: form.company.trim() || undefined,
                    turnstileToken: token,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    data.error ?? 'Something went wrong. Please try again.'
                );
            }
            setStatus('done');
        } catch (err) {
            setStatus('error');
            setMessage(
                err instanceof Error
                    ? err.message
                    : 'Something went wrong. Please try again.'
            );
            window.turnstile?.reset();
            setToken('');
        }
    }

    if (status === 'done') {
        return (
            <div
                style={{
                    border: '1px solid var(--ifm-color-emphasis-200)',
                    borderRadius: 12,
                    padding: '32px 28px',
                    textAlign: 'center',
                    background: 'var(--ifm-card-background-color)',
                }}
            >
                <h2 style={{ marginTop: 0 }}>Check your inbox</h2>
                <p
                    style={{
                        color: 'var(--ifm-color-content-secondary)',
                        marginBottom: 0,
                    }}
                >
                    We&rsquo;ve sent a confirmation link to{' '}
                    <strong>{form.email.trim().toLowerCase()}</strong>. Click it
                    to activate your 30-day trial and receive your licence key.
                </p>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            style={{
                border: '1px solid var(--ifm-color-emphasis-200)',
                borderRadius: 12,
                padding: '28px',
                background: 'var(--ifm-card-background-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
            }}
        >
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 18,
                }}
            >
                <Field
                    label="First name"
                    value={form.firstName}
                    onChange={(v) => update('firstName', v)}
                    placeholder="Jane"
                    required
                    error={errors.firstName}
                />
                <Field
                    label="Last name"
                    value={form.lastName}
                    onChange={(v) => update('lastName', v)}
                    placeholder="Smith"
                    required
                    error={errors.lastName}
                />
            </div>
            <Field
                label="Email address"
                type="email"
                value={form.email}
                onChange={(v) => update('email', v)}
                placeholder="jane@acme.com"
                required
                error={errors.email}
            />
            <Field
                label="Company"
                value={form.company}
                onChange={(v) => update('company', v)}
                placeholder="Acme Corp"
            />

            <div ref={widgetRef} />

            {status === 'error' && message && (
                <div
                    style={{
                        color: 'var(--ifm-color-danger)',
                        fontSize: '0.9rem',
                    }}
                >
                    {message}
                </div>
            )}

            <button
                type="submit"
                className="button button--primary"
                disabled={status === 'submitting'}
                style={{ width: '100%' }}
            >
                {status === 'submitting' ? 'Sending…' : 'Request free trial'}
            </button>

            <p
                style={{
                    fontSize: '0.8rem',
                    color: 'var(--ifm-color-content-secondary)',
                    margin: 0,
                    textAlign: 'center',
                }}
            >
                We&rsquo;ll email you a confirmation link. One trial per email
                address.
            </p>
        </form>
    );
}

export default function Trial(): JSX.Element {
    return (
        <Layout
            title="Free trial"
            description="Start a free 30-day trial of Dockview's enterprise features."
        >
            <main>
                <div
                    style={{
                        maxWidth: 560,
                        margin: '64px auto',
                        padding: '0 24px',
                        minHeight: '60vh',
                    }}
                >
                    <h1 style={{ marginBottom: 8 }}>Start a free trial</h1>
                    <p
                        style={{
                            color: 'var(--ifm-color-content-secondary)',
                            marginBottom: 32,
                        }}
                    >
                        Evaluate Dockview&rsquo;s enterprise features for 30
                        days, no payment required. Enter your details and
                        we&rsquo;ll email you a licence key.
                    </p>
                    <TrialForm />
                </div>
            </main>
        </Layout>
    );
}
