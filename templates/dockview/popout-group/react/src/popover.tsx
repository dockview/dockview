import React from 'react';

const MENU_ITEMS = ['New tab', 'Duplicate panel', 'Rename panel', 'Close panel'];

export function PopoverMenu(props: { window: Window }) {
    const [isOpen, setOpen] = React.useState(false);
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    // helper function to close the menu
    function close() {
        setOpen(false);
    }

    // Close on click outside
    React.useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: Event) {
            if (
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                close();
            }
        }

        const doc = props.window?.document || document;
        doc.addEventListener('mousedown', handleClickOutside);
        return () => doc.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, props.window]);

    return (
        <button
            ref={buttonRef}
            onClick={() => setOpen(!isOpen)}
            style={{ position: 'relative', alignSelf: 'flex-start' }}
        >
            {isOpen ? 'Hide menu' : 'Show menu'}
            {isOpen && (
                <ul
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: '0',
                        background:
                            'var(--dv-group-view-background-color)',
                        color: 'var(--dv-activegroup-visiblepanel-tab-color)',
                        border: '1px solid var(--dv-separator-border)',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
                        listStyle: 'none',
                        padding: '4px 0',
                        margin: '0',
                        minWidth: '160px',
                        textAlign: 'left',
                        zIndex: 1000,
                    }}
                >
                    {MENU_ITEMS.map((item) => (
                        <li
                            key={item}
                            style={{ padding: '6px 16px', cursor: 'pointer' }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                    'var(--dv-activegroup-visiblepanel-tab-background-color)')
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                    'transparent')
                            }
                        >
                            {item}
                        </li>
                    ))}
                </ul>
            )}
        </button>
    );
}
