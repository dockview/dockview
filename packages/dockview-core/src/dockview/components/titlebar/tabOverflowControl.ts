import { createChevronRightButton } from '../../../svg';

export type DropdownElement = {
    element: HTMLElement;
    update: (params: { tabs: number }) => void;
    dispose?: () => void;
};

export function createDropdownElementHandle(): DropdownElement {
    const el = document.createElement('div');
    el.className = 'dv-tabs-overflow-dropdown-default';

    const text = document.createElement('span');
    text.textContent = ``;
    const icon = createChevronRightButton();
    el.appendChild(icon);
    el.appendChild(text);

    return {
        element: el,
        update: (params: { tabs: number }) => {
            // Idempotent: the overflow count is unchanged by scrolling (only by
            // resize / add / remove), so skip rewriting identical text — an
            // unconditional write dirties layout and forces the next stage's
            // geometry read (pinned-sticky / underlines) to reflow. (#1585 audit)
            const next = `${params.tabs}`;
            if (text.textContent !== next) {
                text.textContent = next;
            }
        },
    };
}
