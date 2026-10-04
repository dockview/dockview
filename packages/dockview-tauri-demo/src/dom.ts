type Attrs = Record<string, string>;
type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Attrs = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') {
            node.className = value;
        } else {
            node.setAttribute(key, value);
        }
    }

    node.append(...children);

    return node;
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
    const node = el('button', { type: 'button', class: 'demo-button' }, label);
    node.addEventListener('click', onClick);
    return node;
}

export function field(label: string, value: string): HTMLElement {
    return el(
        'div',
        { class: 'demo-field' },
        el('span', { class: 'demo-field-label' }, label),
        el('span', { class: 'demo-field-value' }, value)
    );
}

export function verdict(ok: boolean, text: string): HTMLElement {
    return el(
        'p',
        {
            class: ok
                ? 'demo-verdict demo-verdict-ok'
                : 'demo-verdict demo-verdict-bad',
        },
        text
    );
}

/** Append-only log with the newest line first, capped so it cannot grow unbounded. */
export class LogView {
    readonly element = el('div', { class: 'demo-log' });

    append(text: string): void {
        const stamp = new Date().toLocaleTimeString();
        this.element.prepend(
            el('div', { class: 'demo-log-line' }, `${stamp}  ${text}`)
        );

        while (this.element.childElementCount > 100) {
            this.element.lastElementChild?.remove();
        }
    }
}
