import { fireEvent } from '@testing-library/dom';
import { fromPartial } from '@total-typescript/shoehorn';
import { ContextMenuController, ContextMenuModule } from '../contextMenu';
import { DockviewComponent } from 'dockview-core';
import { DockviewGroupPanel } from 'dockview-core';
import { IDockviewPanel } from 'dockview-core';
import { PopupService } from 'dockview-core';
import { DEFAULT_TAB_GROUP_COLORS, TabGroupColorPalette } from 'dockview-core';
import { ITabGroup } from 'dockview-core';

function makeAccessor(
    overrides: {
        getTabContextMenuItems?: jest.Mock;
        getTabGroupChipContextMenuItems?: jest.Mock;
        createContextMenuItemComponent?: jest.Mock;
        api?: any;
    } = {}
) {
    const openPopover = jest.fn();
    const close = jest.fn();
    const popupService = fromPartial<PopupService>({ openPopover, close });

    const accessor = fromPartial<DockviewComponent>({
        options: {
            getTabContextMenuItems: overrides.getTabContextMenuItems,
            getTabGroupChipContextMenuItems:
                overrides.getTabGroupChipContextMenuItems,
            createContextMenuItemComponent:
                overrides.createContextMenuItemComponent,
        },
        api: overrides.api ?? ({} as any),
        popupService,
        getPopupServiceForGroup: () => popupService,
    });

    return { accessor, openPopover, close };
}

function makePanel(closeFn = jest.fn()) {
    return fromPartial<IDockviewPanel>({ api: { close: closeFn } });
}

function makeRichPanel(
    overrides: {
        close?: jest.Mock;
        maximize?: jest.Mock;
        exitMaximized?: jest.Mock;
        isMaximized?: boolean;
        location?: 'grid' | 'floating' | 'popout';
        id?: string;
    } = {}
) {
    return fromPartial<IDockviewPanel>({
        id: overrides.id,
        api: {
            close: overrides.close ?? jest.fn(),
            maximize: overrides.maximize ?? jest.fn(),
            exitMaximized: overrides.exitMaximized ?? jest.fn(),
            isMaximized: () => overrides.isMaximized ?? false,
            location: { type: overrides.location ?? 'grid' },
        },
    });
}

function makeGroup(panels: IDockviewPanel[] = []) {
    return fromPartial<DockviewGroupPanel>({ panels });
}

describe('ContextMenuController', () => {
    describe('show()', () => {
        test('calls event.preventDefault() when menu items are returned', () => {
            const { accessor } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.show(makePanel(), makeGroup(), event);

            expect(spy).toHaveBeenCalled();
        });

        test('does not call event.preventDefault() when no callback provided', () => {
            const { accessor } = makeAccessor();
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.show(makePanel(), makeGroup(), event);

            expect(spy).not.toHaveBeenCalled();
        });

        test('does not call event.preventDefault() when callback returns empty array', () => {
            const { accessor } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue([]),
            });
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.show(makePanel(), makeGroup(), event);

            expect(spy).not.toHaveBeenCalled();
        });

        test('calls popupService.openPopover with correct coordinates', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', {
                clientX: 150,
                clientY: 300,
            });

            controller.show(makePanel(), makeGroup(), event);

            expect(openPopover).toHaveBeenCalledWith(expect.any(HTMLElement), {
                x: 150,
                y: 300,
            });
        });

        test('does not call openPopover when getTabContextMenuItems returns empty array', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue([]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            expect(openPopover).not.toHaveBeenCalled();
        });

        test('does not show menu when no callback provided', () => {
            const { accessor, openPopover } = makeAccessor();
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            expect(openPopover).not.toHaveBeenCalled();
        });

        test('menu element has class dv-context-menu', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.className).toBe('dv-context-menu');
        });

        test('menu element has role="menu"', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.getAttribute('role')).toBe('menu');
        });
    });

    describe('popover z-index for floating groups', () => {
        // Floating overlays live in the shell as siblings of the popover anchor
        // and AriaLevelTracker sets their inline z-index. Without bumping the
        // popover above that, a context menu opened from inside a floating
        // group renders behind it (#1203 regression).
        function dispatchContextMenu(target: HTMLElement): MouseEvent {
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
            });
            target.dispatchEvent(event);
            return event;
        }

        test('passes zIndex above the floating overlay when target is inside one', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            const floating = document.createElement('div');
            floating.style.zIndex = '1001'; // simulates AriaLevelTracker output
            const tab = document.createElement('div');
            floating.appendChild(tab);
            document.body.appendChild(floating);

            try {
                const event = dispatchContextMenu(tab);
                controller.show(makePanel(), makeGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(1001 * 2)',
                    })
                );
            } finally {
                document.body.removeChild(floating);
            }
        });

        test('does not pass zIndex when target has no z-indexed ancestor', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            const tab = document.createElement('div');
            document.body.appendChild(tab);

            try {
                const event = dispatchContextMenu(tab);
                controller.show(makePanel(), makeGroup(), event);

                const args = openPopover.mock.calls[0][1];
                expect(args.zIndex).toBeUndefined();
            } finally {
                document.body.removeChild(tab);
            }
        });

        test('walks up multiple levels to find the z-indexed ancestor', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            const floating = document.createElement('div');
            floating.style.zIndex = '999';
            const group = document.createElement('div');
            const tabsContainer = document.createElement('div');
            const tab = document.createElement('div');
            floating.appendChild(group);
            group.appendChild(tabsContainer);
            tabsContainer.appendChild(tab);
            document.body.appendChild(floating);

            try {
                const event = dispatchContextMenu(tab);
                controller.show(makePanel(), makeGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(999 * 2)',
                    })
                );
            } finally {
                document.body.removeChild(floating);
            }
        });

        test('uses the nearest z-indexed ancestor when several are stacked', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            const outer = document.createElement('div');
            outer.style.zIndex = '500';
            const inner = document.createElement('div');
            inner.style.zIndex = '1003';
            const tab = document.createElement('div');
            outer.appendChild(inner);
            inner.appendChild(tab);
            document.body.appendChild(outer);

            try {
                const event = dispatchContextMenu(tab);
                controller.show(makePanel(), makeGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(1003 * 2)',
                    })
                );
            } finally {
                document.body.removeChild(outer);
            }
        });
    });

    describe('popover z-index for peeking auto-hide edge groups', () => {
        // A peeking edge group slides its panel out as an overlay on the shell
        // (z-index 999 / header 1001). A tab context menu shares the shell
        // stacking context but anchors earlier in DOM order, so at the default
        // overlay z-index it renders *behind* the peek. The clicked strip tab
        // isn't inside the peek overlay, so the ancestor walk can't find its
        // z-index — the menu must key off the peek state and lift clear of it.
        function dispatchContextMenu(target: HTMLElement): MouseEvent {
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
            });
            target.dispatchEvent(event);
            return event;
        }

        const peekingGroup = () =>
            fromPartial<DockviewGroupPanel>({
                panels: [],
                api: { isPeeking: () => true },
            });

        test('lifts the tab menu above the peek band while peeking', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            // A strip tab with no z-indexed ancestor: at the default overlay
            // z-index it would render behind the peek.
            const tab = document.createElement('div');
            document.body.appendChild(tab);

            try {
                const event = dispatchContextMenu(tab);
                controller.show(makePanel(), peekingGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(var(--dv-overlay-z-index, 999) + 100)',
                    })
                );
            } finally {
                document.body.removeChild(tab);
            }
        });

        test('peek lift takes precedence over a z-indexed ancestor', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            const floating = document.createElement('div');
            floating.style.zIndex = '1001';
            const tab = document.createElement('div');
            floating.appendChild(tab);
            document.body.appendChild(floating);

            try {
                const event = dispatchContextMenu(tab);
                controller.show(makePanel(), peekingGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(var(--dv-overlay-z-index, 999) + 100)',
                    })
                );
            } finally {
                document.body.removeChild(floating);
            }
        });

        test('lifts the chip menu above the peek band while peeking', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabGroupChipContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ label: 'Rename', action: jest.fn() }]),
            });
            const controller = new ContextMenuController(accessor);

            const chip = document.createElement('div');
            document.body.appendChild(chip);

            try {
                const event = dispatchContextMenu(chip);
                controller.showForChip(fromPartial({}), peekingGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(var(--dv-overlay-z-index, 999) + 100)',
                    })
                );
            } finally {
                document.body.removeChild(chip);
            }
        });
    });

    describe('ARIA attributes', () => {
        test('built-in label items have role="menuitem"', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['close', 'closeOthers', 'closeAll']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup([makePanel()]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const items = menuEl.querySelectorAll('.dv-context-menu-item');
            items.forEach((item) => {
                expect(item.getAttribute('role')).toBe('menuitem');
            });
        });

        test('separator has role="separator"', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['separator']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const sep = menuEl.querySelector('.dv-context-menu-separator')!;
            expect(sep.getAttribute('role')).toBe('separator');
        });

        test('disabled items have aria-disabled="true"', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue([
                    {
                        label: 'Disabled',
                        action: jest.fn(),
                        disabled: true,
                    },
                ]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBe('true');
        });

        test('enabled items do not have aria-disabled', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ label: 'Enabled', action: jest.fn() }]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBeNull();
        });
    });

    describe("built-in 'close' item", () => {
        test('calls panel.api.close() and closes popup on click', () => {
            const closePanelMock = jest.fn();
            const { accessor, openPopover, close } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(closePanelMock),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);

            expect(closePanelMock).toHaveBeenCalled();
            expect(close).toHaveBeenCalled();
        });
    });

    describe("built-in 'closeOthers' item", () => {
        test('closes all panels except the target panel', () => {
            const close1 = jest.fn();
            const close2 = jest.fn();
            const close3 = jest.fn();

            const panel1 = makePanel(close1);
            const panel2 = makePanel(close2);
            const panel3 = makePanel(close3);

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['closeOthers']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel2,
                makeGroup([panel1, panel2, panel3]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);

            expect(close1).toHaveBeenCalled();
            expect(close2).not.toHaveBeenCalled();
            expect(close3).toHaveBeenCalled();
        });
    });

    describe("built-in 'closeAll' item", () => {
        test('closes all panels in the group', () => {
            const close1 = jest.fn();
            const close2 = jest.fn();
            const close3 = jest.fn();

            const panel1 = makePanel(close1);
            const panel2 = makePanel(close2);
            const panel3 = makePanel(close3);

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['closeAll']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel1,
                makeGroup([panel1, panel2, panel3]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);

            expect(close1).toHaveBeenCalled();
            expect(close2).toHaveBeenCalled();
            expect(close3).toHaveBeenCalled();
        });
    });

    describe("built-in 'closeLeft' item", () => {
        test('closes only the panels before the target panel', () => {
            const close1 = jest.fn();
            const close2 = jest.fn();
            const close3 = jest.fn();
            const panel1 = makePanel(close1);
            const panel2 = makePanel(close2);
            const panel3 = makePanel(close3);

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['closeLeft']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel2,
                makeGroup([panel1, panel2, panel3]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);

            expect(close1).toHaveBeenCalled();
            expect(close2).not.toHaveBeenCalled();
            expect(close3).not.toHaveBeenCalled();
        });

        test('is disabled when the panel is the first tab', () => {
            const panel1 = makePanel();
            const panel2 = makePanel();

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['closeLeft']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel1,
                makeGroup([panel1, panel2]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBe('true');
        });
    });

    describe("built-in 'closeRight' item", () => {
        test('closes only the panels after the target panel', () => {
            const close1 = jest.fn();
            const close2 = jest.fn();
            const close3 = jest.fn();
            const panel1 = makePanel(close1);
            const panel2 = makePanel(close2);
            const panel3 = makePanel(close3);

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['closeRight']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel2,
                makeGroup([panel1, panel2, panel3]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);

            expect(close1).not.toHaveBeenCalled();
            expect(close2).not.toHaveBeenCalled();
            expect(close3).toHaveBeenCalled();
        });

        test('is disabled when the panel is the last tab', () => {
            const panel1 = makePanel();
            const panel2 = makePanel();

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['closeRight']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel2,
                makeGroup([panel1, panel2]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBe('true');
        });
    });

    describe("built-in 'maximize' item", () => {
        test('renders "Maximize" and calls maximize() when not maximized', () => {
            const maximize = jest.fn();
            const panel = makeRichPanel({ maximize, isMaximized: false });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['maximize']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Maximize');

            fireEvent.click(item);
            expect(maximize).toHaveBeenCalled();
        });

        test('renders "Restore" and calls exitMaximized() when maximized', () => {
            const exitMaximized = jest.fn();
            const panel = makeRichPanel({
                exitMaximized,
                isMaximized: true,
            });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['maximize']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Restore');

            fireEvent.click(item);
            expect(exitMaximized).toHaveBeenCalled();
        });

        test('is disabled for a floating panel that is not maximized', () => {
            const panel = makeRichPanel({
                location: 'floating',
                isMaximized: false,
            });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['maximize']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBe('true');
        });
    });

    describe("built-in 'float' item", () => {
        test('calls api.addFloatingGroup() with the panel', () => {
            const addFloatingGroup = jest.fn();
            const panel = makeRichPanel({ location: 'grid' });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['float']),
                api: { addFloatingGroup },
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Float');
            fireEvent.click(item);

            expect(addFloatingGroup).toHaveBeenCalledWith(panel);
        });

        test('is disabled when the panel is already floating', () => {
            const panel = makeRichPanel({ location: 'floating' });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['float']),
                api: { addFloatingGroup: jest.fn() },
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBe('true');
        });
    });

    describe("built-in 'popout' item", () => {
        test('calls api.addPopoutGroup() with the panel', () => {
            const addPopoutGroup = jest.fn().mockResolvedValue(true);
            const panel = makeRichPanel({ location: 'grid' });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['popout']),
                api: { addPopoutGroup },
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Open in New Window');
            fireEvent.click(item);

            expect(addPopoutGroup).toHaveBeenCalledWith(panel);
        });

        test('is disabled when the panel is already popped out', () => {
            const panel = makeRichPanel({ location: 'popout' });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['popout']),
                api: { addPopoutGroup: jest.fn() },
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                panel,
                makeGroup([panel]),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.getAttribute('aria-disabled')).toBe('true');
        });
    });

    describe("built-in 'separator' item", () => {
        test('renders a separator element', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['separator']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(
                menuEl.querySelectorAll('.dv-context-menu-separator')
            ).toHaveLength(1);
            expect(
                menuEl.querySelectorAll('.dv-context-menu-item')
            ).toHaveLength(0);
        });
    });

    describe('custom label item', () => {
        test('renders label text and calls action on click', () => {
            const actionMock = jest.fn();
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([
                        { label: 'My Action', action: actionMock },
                    ]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('My Action');

            fireEvent.click(item);
            expect(actionMock).toHaveBeenCalled();
        });

        test('does not call action when disabled', () => {
            const actionMock = jest.fn();
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue([
                    {
                        label: 'Disabled',
                        action: actionMock,
                        disabled: true,
                    },
                ]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(
                item.classList.contains('dv-context-menu-item--disabled')
            ).toBe(true);
            fireEvent.click(item);
            expect(actionMock).not.toHaveBeenCalled();
        });
    });

    describe('custom component item', () => {
        test('calls createContextMenuItemComponent with the component reference', () => {
            const componentRef = { type: 'my-component' };
            const rendererElement = document.createElement('div');
            const initMock = jest.fn();
            const createContextMenuItemComponent = jest.fn().mockReturnValue({
                element: rendererElement,
                init: initMock,
                dispose: jest.fn(),
            });

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ component: componentRef }]),
                createContextMenuItemComponent,
            });
            const controller = new ContextMenuController(accessor);

            const panel = makePanel();
            const group = makeGroup();
            controller.show(panel, group, new MouseEvent('contextmenu'));

            expect(createContextMenuItemComponent).toHaveBeenCalledWith(
                expect.objectContaining({ component: componentRef })
            );
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ panel, group })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.contains(rendererElement)).toBe(true);
        });

        test('init receives a close function that calls popupService.close()', () => {
            const initMock = jest.fn();
            const createContextMenuItemComponent = jest.fn().mockReturnValue({
                element: document.createElement('div'),
                init: initMock,
                dispose: jest.fn(),
            });

            const { accessor, close } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ component: {} }]),
                createContextMenuItemComponent,
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const { close: closeFn } = initMock.mock.calls[0][0];
            closeFn();
            expect(close).toHaveBeenCalled();
        });

        test('forwards componentProps to renderer.init()', () => {
            const componentRef = { type: 'my-component' };
            const initMock = jest.fn();
            const createContextMenuItemComponent = jest.fn().mockReturnValue({
                element: document.createElement('div'),
                init: initMock,
                dispose: jest.fn(),
            });

            const { accessor } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue([
                    {
                        component: componentRef,
                        componentProps: { foo: 'bar' },
                    },
                ]),
                createContextMenuItemComponent,
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ componentProps: { foo: 'bar' } })
            );
        });

        test('skips item if createContextMenuItemComponent returns undefined', () => {
            const createContextMenuItemComponent = jest
                .fn()
                .mockReturnValue(undefined);
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ component: {} }]),
                createContextMenuItemComponent,
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.children).toHaveLength(0);
        });
    });

    describe('mixed item list', () => {
        test('renders items in order with correct types', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([
                        'close',
                        'separator',
                        { label: 'Custom' },
                        'closeAll',
                    ]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.children).toHaveLength(4);
            expect(menuEl.children[0].className).toBe('dv-context-menu-item');
            expect(menuEl.children[1].className).toBe(
                'dv-context-menu-separator'
            );
            expect(menuEl.children[2].className).toBe('dv-context-menu-item');
            expect(menuEl.children[3].className).toBe('dv-context-menu-item');
        });
    });

    describe('color picker', () => {
        function makeChipAccessor(palette: TabGroupColorPalette) {
            const openPopover = jest.fn();
            const close = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close,
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    getTabGroupChipContextMenuItems: jest
                        .fn()
                        .mockReturnValue(['colorPicker']),
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
                tabGroupColorPalette: palette,
            });
            return { accessor, openPopover };
        }

        function getMenuEl(openPopover: jest.Mock): HTMLElement {
            const call = openPopover.mock.calls[0];
            return call[0] as HTMLElement;
        }

        test('renders one swatch per palette entry with backgroundColor set', () => {
            const palette = new TabGroupColorPalette(DEFAULT_TAB_GROUP_COLORS);
            const { accessor, openPopover } = makeChipAccessor(palette);
            const controller = new ContextMenuController(accessor);

            const tabGroup = fromPartial<ITabGroup>({
                color: 'blue',
                setColor: jest.fn(),
            });
            const event = new MouseEvent('contextmenu', { cancelable: true });
            controller.showForChip(tabGroup, makeGroup(), event);

            const menuEl = getMenuEl(openPopover);
            const picker = menuEl.querySelector(
                '.dv-context-menu-color-picker'
            )!;
            const swatches = picker.querySelectorAll(
                '.dv-context-menu-color-swatch'
            );
            expect(swatches).toHaveLength(DEFAULT_TAB_GROUP_COLORS.length);

            const first = swatches[0] as HTMLElement;
            expect(first.style.getPropertyValue('--dv-tab-group-color')).toBe(
                DEFAULT_TAB_GROUP_COLORS[0].value
            );

            // The 'blue' swatch is the second entry in defaults; it should be
            // marked as selected.
            const blueIndex = DEFAULT_TAB_GROUP_COLORS.findIndex(
                (e) => e.id === 'blue'
            );
            expect(
                (swatches[blueIndex] as HTMLElement).classList.contains(
                    'dv-context-menu-color-swatch--selected'
                )
            ).toBe(true);
        });

        test('renders custom palette entries', () => {
            const palette = new TabGroupColorPalette([
                { id: 'brand', value: '#123456', label: 'Brand' },
                { id: 'accent', value: '#abcdef', label: 'Accent' },
            ]);
            const { accessor, openPopover } = makeChipAccessor(palette);
            const controller = new ContextMenuController(accessor);

            const tabGroup = fromPartial<ITabGroup>({
                color: 'brand',
                setColor: jest.fn(),
            });
            const event = new MouseEvent('contextmenu', { cancelable: true });
            controller.showForChip(tabGroup, makeGroup(), event);

            const menuEl = getMenuEl(openPopover);
            const swatches = menuEl.querySelectorAll(
                '.dv-context-menu-color-swatch'
            );
            expect(swatches).toHaveLength(2);
            expect((swatches[0] as HTMLElement).title).toBe('Brand');
            expect(
                (swatches[0] as HTMLElement).style.getPropertyValue(
                    '--dv-tab-group-color'
                )
            ).toBe('#123456');
        });

        test('renders empty wrapper when palette is disabled', () => {
            const palette = new TabGroupColorPalette(
                DEFAULT_TAB_GROUP_COLORS,
                false
            );
            const { accessor, openPopover } = makeChipAccessor(palette);
            const controller = new ContextMenuController(accessor);

            const tabGroup = fromPartial<ITabGroup>({
                color: 'blue',
                setColor: jest.fn(),
            });
            const event = new MouseEvent('contextmenu', { cancelable: true });
            controller.showForChip(tabGroup, makeGroup(), event);

            const menuEl = getMenuEl(openPopover);
            const picker = menuEl.querySelector(
                '.dv-context-menu-color-picker'
            )!;
            expect(picker).toBeTruthy();
            expect(
                picker.querySelectorAll('.dv-context-menu-color-swatch')
            ).toHaveLength(0);
        });
    });

    describe("built-in chip 'collapse' item", () => {
        function makeChipAccessor(items: unknown[]) {
            const openPopover = jest.fn();
            const close = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close,
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    getTabGroupChipContextMenuItems: jest
                        .fn()
                        .mockReturnValue(items),
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
            });
            return { accessor, openPopover };
        }

        test('renders "Collapse" and toggles when expanded', () => {
            const toggle = jest.fn();
            const { accessor, openPopover } = makeChipAccessor(['collapse']);
            const controller = new ContextMenuController(accessor);

            const tabGroup = fromPartial<ITabGroup>({
                collapsed: false,
                toggle,
            });
            controller.showForChip(
                tabGroup,
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Collapse');
            fireEvent.click(item);
            expect(toggle).toHaveBeenCalled();
        });

        test('renders "Expand" when the tab group is collapsed', () => {
            const { accessor, openPopover } = makeChipAccessor(['collapse']);
            const controller = new ContextMenuController(accessor);

            const tabGroup = fromPartial<ITabGroup>({
                collapsed: true,
                toggle: jest.fn(),
            });
            controller.showForChip(
                tabGroup,
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Expand');
        });

        test("'close' closes only the panels belonging to the tab group", () => {
            const close1 = jest.fn();
            const close2 = jest.fn();
            const close3 = jest.fn();
            const panel1 = makeRichPanel({ close: close1, id: 'p1' });
            const panel2 = makeRichPanel({ close: close2, id: 'p2' });
            const panel3 = makeRichPanel({ close: close3, id: 'p3' });

            const { accessor, openPopover } = makeChipAccessor(['close']);
            const controller = new ContextMenuController(accessor);

            const tabGroup = fromPartial<ITabGroup>({
                containsPanel: (id: string) => id === 'p1' || id === 'p3',
            });
            controller.showForChip(
                tabGroup,
                makeGroup([panel1, panel2, panel3]),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);

            expect(close1).toHaveBeenCalled();
            expect(close2).not.toHaveBeenCalled();
            expect(close3).toHaveBeenCalled();
        });
    });

    describe('showForChip()', () => {
        test('passes zIndex above the floating overlay when chip is inside one', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabGroupChipContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ label: 'Rename', action: jest.fn() }]),
            });
            const controller = new ContextMenuController(accessor);

            const floating = document.createElement('div');
            floating.style.zIndex = '1001';
            const chip = document.createElement('div');
            floating.appendChild(chip);
            document.body.appendChild(floating);

            try {
                const event = new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                });
                chip.dispatchEvent(event);

                controller.showForChip(fromPartial({}), makeGroup(), event);

                expect(openPopover).toHaveBeenCalledWith(
                    expect.any(HTMLElement),
                    expect.objectContaining({
                        zIndex: 'calc(1001 * 2)',
                    })
                );
            } finally {
                document.body.removeChild(floating);
            }
        });
    });

    describe("'pin' built-in item", () => {
        const pinPanel = (isPinned: boolean, setPinned = jest.fn()) =>
            fromPartial<IDockviewPanel>({
                api: { isPinned, setPinned, close: jest.fn() },
            });

        test('renders "Pin tab" and pins on click when unpinned', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['pin']),
            });
            const controller = new ContextMenuController(accessor);
            const setPinned = jest.fn();

            controller.show(
                pinPanel(false, setPinned),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.textContent).toBe('Pin tab');

            fireEvent.click(item);
            expect(setPinned).toHaveBeenCalledWith(true);
        });

        test('renders "Unpin tab" and unpins on click when pinned', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest.fn().mockReturnValue(['pin']),
            });
            const controller = new ContextMenuController(accessor);
            const setPinned = jest.fn();

            controller.show(
                pinPanel(true, setPinned),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector('.dv-context-menu-item')!;
            expect(item.textContent).toBe('Unpin tab');

            fireEvent.click(item);
            expect(setPinned).toHaveBeenCalledWith(false);
        });
    });

    describe('auto-injected Pin/Unpin item', () => {
        const pinPanel = (isPinned = false, setPinned = jest.fn()) =>
            fromPartial<IDockviewPanel>({
                api: { isPinned, setPinned, close: jest.fn() },
            });

        function makePinAccessor(overrides: {
            pinnedTabs?: any;
            hasService?: boolean;
            getTabContextMenuItems?: jest.Mock;
        }) {
            const openPopover = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close: jest.fn(),
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    pinnedTabs: overrides.pinnedTabs,
                    getTabContextMenuItems: overrides.getTabContextMenuItems,
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
                pinnedTabsService:
                    overrides.hasService === false ? undefined : ({} as any),
            });
            return { accessor, openPopover };
        }

        const labels = (menuEl: HTMLElement): string[] =>
            Array.from(menuEl.querySelectorAll('.dv-context-menu-item')).map(
                (el) => el.textContent ?? ''
            );

        test('prepends Pin/Unpin when enabled, service present, no app callback', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: true },
            });
            const controller = new ContextMenuController(accessor);
            const setPinned = jest.fn();

            controller.show(
                pinPanel(false, setPinned),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(labels(menuEl)).toEqual(['Pin tab']);

            fireEvent.click(menuEl.querySelector('.dv-context-menu-item')!);
            expect(setPinned).toHaveBeenCalledWith(true);
        });

        test('renders "Unpin tab" for an already-pinned panel', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: true },
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                pinPanel(true),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(labels(menuEl)).toEqual(['Unpin tab']);
        });

        test('prepends Pin/Unpin ahead of the app-supplied items, preserving them', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: true },
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['close', 'closeOthers']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                pinPanel(),
                makeGroup([pinPanel()]),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(labels(menuEl)).toEqual([
                'Pin tab',
                'Close',
                'Close Others',
            ]);
        });

        test('does not inject when contextMenuItem is false', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: true, contextMenuItem: false },
            });
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.show(pinPanel(), makeGroup(), event);

            // No app items + suppressed pin => no menu at all.
            expect(openPopover).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
        });

        test('injects by default when contextMenuItem is unset', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: true },
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                pinPanel(),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(labels(menuEl)).toContain('Pin tab');
        });

        test('does not inject when the PinnedTabs module is absent', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: true },
                hasService: false,
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                pinPanel(),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            expect(openPopover).not.toHaveBeenCalled();
        });

        test('does not inject when pinnedTabs is not enabled', () => {
            const { accessor, openPopover } = makePinAccessor({
                pinnedTabs: { enabled: false },
                getTabContextMenuItems: jest.fn().mockReturnValue(['close']),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                pinPanel(),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(labels(menuEl)).toEqual(['Close']);
        });
    });

    describe('custom element item in show()', () => {
        test('appends the provided element directly', () => {
            const customEl = document.createElement('section');
            customEl.className = 'my-custom-element';

            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ element: customEl }]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu')
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.contains(customEl)).toBe(true);
            expect(menuEl.querySelector('.my-custom-element')).toBe(customEl);
        });
    });

    describe('color swatch click', () => {
        function makeChipAccessor(palette: TabGroupColorPalette) {
            const openPopover = jest.fn();
            const close = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close,
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    getTabGroupChipContextMenuItems: jest
                        .fn()
                        .mockReturnValue(['colorPicker']),
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
                tabGroupColorPalette: palette,
            });
            return { accessor, openPopover };
        }

        test('calls tabGroup.setColor() with the entry id on click', () => {
            const palette = new TabGroupColorPalette([
                { id: 'brand', value: '#123456', label: 'Brand' },
                { id: 'accent', value: '#abcdef', label: 'Accent' },
            ]);
            const { accessor, openPopover } = makeChipAccessor(palette);
            const controller = new ContextMenuController(accessor);

            const setColor = jest.fn();
            const tabGroup = fromPartial<ITabGroup>({
                color: 'brand',
                setColor,
            });
            controller.showForChip(
                tabGroup,
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const swatches = menuEl.querySelectorAll(
                '.dv-context-menu-color-swatch'
            );
            fireEvent.click(swatches[1]);

            expect(setColor).toHaveBeenCalledWith('accent');
        });

        test('omits the title attribute for palette entries without a label', () => {
            const palette = new TabGroupColorPalette([
                { id: 'nolabel', value: '#010203' },
            ]);
            const { accessor, openPopover } = makeChipAccessor(palette);
            const controller = new ContextMenuController(accessor);

            controller.showForChip(
                fromPartial<ITabGroup>({ color: 'other', setColor: jest.fn() }),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const swatch = menuEl.querySelector(
                '.dv-context-menu-color-swatch'
            ) as HTMLElement;
            expect(swatch.title).toBe('');
            expect(
                swatch.classList.contains(
                    'dv-context-menu-color-swatch--selected'
                )
            ).toBe(false);
        });
    });

    describe('config items with no renderable field', () => {
        test('show() renders nothing for a config with no element/component/label', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabContextMenuItems: jest
                    .fn()
                    .mockReturnValue([{ componentProps: { foo: 'bar' } }]),
            });
            const controller = new ContextMenuController(accessor);

            controller.show(
                makePanel(),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.children).toHaveLength(0);
        });

        test('showForChip() renders nothing for a config with no element/label', () => {
            const openPopover = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close: jest.fn(),
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    getTabGroupChipContextMenuItems: jest
                        .fn()
                        .mockReturnValue([{ componentProps: { foo: 'bar' } }]),
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
            });
            const controller = new ContextMenuController(accessor);

            controller.showForChip(
                fromPartial({}),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.children).toHaveLength(0);
        });
    });

    describe('showForChip() early returns', () => {
        test('does nothing when getTabGroupChipContextMenuItems is not provided', () => {
            const { accessor, openPopover } = makeAccessor();
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.showForChip(fromPartial({}), makeGroup(), event);

            expect(openPopover).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
        });

        test('does nothing when the callback returns an empty array', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabGroupChipContextMenuItems: jest.fn().mockReturnValue([]),
            });
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.showForChip(fromPartial({}), makeGroup(), event);

            expect(openPopover).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
        });

        test('calls preventDefault() and opens the popover when items exist', () => {
            const { accessor, openPopover } = makeAccessor({
                getTabGroupChipContextMenuItems: jest
                    .fn()
                    .mockReturnValue(['collapse']),
            });
            const controller = new ContextMenuController(accessor);
            const event = new MouseEvent('contextmenu', { cancelable: true });
            const spy = jest.spyOn(event, 'preventDefault');

            controller.showForChip(
                fromPartial<ITabGroup>({ collapsed: false, toggle: jest.fn() }),
                makeGroup(),
                event
            );

            expect(spy).toHaveBeenCalled();
            expect(openPopover).toHaveBeenCalled();
        });
    });

    describe('showForChip() item types', () => {
        function makeChipAccessor(items: unknown[]) {
            const openPopover = jest.fn();
            const close = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close,
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    getTabGroupChipContextMenuItems: jest
                        .fn()
                        .mockReturnValue(items),
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
            });
            return { accessor, openPopover, close };
        }

        test('renders a separator', () => {
            const { accessor, openPopover } = makeChipAccessor(['separator']);
            const controller = new ContextMenuController(accessor);

            controller.showForChip(
                fromPartial({}),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(
                menuEl.querySelectorAll('.dv-context-menu-separator')
            ).toHaveLength(1);
        });

        test('appends a custom element item directly', () => {
            const customEl = document.createElement('span');
            customEl.className = 'chip-custom-element';
            const { accessor, openPopover } = makeChipAccessor([
                { element: customEl },
            ]);
            const controller = new ContextMenuController(accessor);

            controller.showForChip(
                fromPartial({}),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            expect(menuEl.contains(customEl)).toBe(true);
        });

        test('renders a custom label item and runs its action on click', () => {
            const action = jest.fn();
            const { accessor, openPopover, close } = makeChipAccessor([
                { label: 'Chip Action', action },
            ]);
            const controller = new ContextMenuController(accessor);

            controller.showForChip(
                fromPartial({}),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(item.textContent).toBe('Chip Action');

            fireEvent.click(item);
            expect(action).toHaveBeenCalled();
            expect(close).toHaveBeenCalled();
        });

        test('label item with no action does not throw on click', () => {
            const { accessor, openPopover, close } = makeChipAccessor([
                { label: 'No Action' },
            ]);
            const controller = new ContextMenuController(accessor);

            controller.showForChip(
                fromPartial({}),
                makeGroup(),
                new MouseEvent('contextmenu', { cancelable: true })
            );

            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            const item = menuEl.querySelector(
                '.dv-context-menu-item'
            ) as HTMLElement;
            expect(() => fireEvent.click(item)).not.toThrow();
            expect(close).toHaveBeenCalled();
        });
    });

    describe('showForChip() component items', () => {
        // A renderer stub whose element and init spy the test can inspect.
        const rendererStub = (initMock: jest.Mock) => ({
            element: document.createElement('div'),
            init: initMock,
            dispose: jest.fn(),
        });

        // Drive showForChip with a single chip `component` item. Reuses the
        // top-level makeAccessor (which already wires the chip callback, the
        // component factory and the api), then returns the rendered menu plus
        // the tabGroup/group references so assertions can match them.
        function showChipComponent(
            item: object,
            createContextMenuItemComponent?: jest.Mock,
            api: any = {}
        ) {
            const { accessor, openPopover, close } = makeAccessor({
                getTabGroupChipContextMenuItems: jest
                    .fn()
                    .mockReturnValue([item]),
                createContextMenuItemComponent,
                api,
            });
            const tabGroup = fromPartial<ITabGroup>({ label: 'Monitoring' });
            const group = makeGroup();
            new ContextMenuController(accessor).showForChip(
                tabGroup,
                group,
                new MouseEvent('contextmenu', { cancelable: true })
            );
            const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
            return { menuEl, close, tabGroup, group };
        }

        test('calls createContextMenuItemComponent and inits with the chip params', () => {
            const componentRef = { type: 'my-chip-component' };
            const initMock = jest.fn();
            const stub = rendererStub(initMock);
            const factory = jest.fn().mockReturnValue(stub);
            const api = {} as any;

            const { menuEl, tabGroup, group } = showChipComponent(
                { component: componentRef },
                factory,
                api
            );

            expect(factory).toHaveBeenCalledWith(
                expect.objectContaining({ component: componentRef })
            );
            // The chip menu hands over the tab group (not a panel) plus the
            // group and api.
            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ tabGroup, group, api })
            );
            expect(menuEl.contains(stub.element)).toBe(true);
        });

        test('forwards componentProps to renderer.init()', () => {
            const initMock = jest.fn();
            const factory = jest.fn().mockReturnValue(rendererStub(initMock));

            showChipComponent(
                { component: {}, componentProps: { foo: 'bar' } },
                factory
            );

            expect(initMock).toHaveBeenCalledWith(
                expect.objectContaining({ componentProps: { foo: 'bar' } })
            );
        });

        test('init receives a close function that calls popupService.close()', () => {
            const initMock = jest.fn();
            const factory = jest.fn().mockReturnValue(rendererStub(initMock));

            const { close } = showChipComponent({ component: {} }, factory);

            const { close: closeFn } = initMock.mock.calls[0][0];
            closeFn();
            expect(close).toHaveBeenCalled();
        });

        test('skips the item if createContextMenuItemComponent returns undefined', () => {
            const factory = jest.fn().mockReturnValue(undefined);

            const { menuEl } = showChipComponent({ component: {} }, factory);

            expect(menuEl.children).toHaveLength(0);
        });

        test('skips a component item when no createContextMenuItemComponent factory is configured', () => {
            const { menuEl } = showChipComponent({ component: {} });

            expect(menuEl.children).toHaveLength(0);
        });
    });

    describe("chip 'rename' input", () => {
        function makeChipAccessor(items: unknown[]) {
            const openPopover = jest.fn();
            const popupService = fromPartial<PopupService>({
                openPopover,
                close: jest.fn(),
            });
            const accessor = fromPartial<DockviewComponent>({
                options: {
                    getTabGroupChipContextMenuItems: jest
                        .fn()
                        .mockReturnValue(items),
                },
                api: {} as any,
                popupService,
                getPopupServiceForGroup: () => popupService,
            });
            return { accessor, openPopover };
        }

        function renderRename(
            tabGroup: ITabGroup,
            rafImpl?: (cb: FrameRequestCallback) => number
        ): HTMLInputElement {
            const raf = jest
                .spyOn(globalThis, 'requestAnimationFrame')
                .mockImplementation(
                    rafImpl ??
                        ((cb: FrameRequestCallback) => {
                            cb(0);
                            return 0;
                        })
                );
            try {
                const { accessor, openPopover } = makeChipAccessor(['rename']);
                const controller = new ContextMenuController(accessor);
                controller.showForChip(
                    tabGroup,
                    makeGroup(),
                    new MouseEvent('contextmenu', { cancelable: true })
                );
                const menuEl = openPopover.mock.calls[0][0] as HTMLElement;
                return menuEl.querySelector(
                    '.dv-context-menu-rename-input'
                ) as HTMLInputElement;
            } finally {
                raf.mockRestore();
            }
        }

        afterEach(() => {
            // matchMedia may be assigned by individual tests; clean up.
            // @ts-expect-error jsdom does not define matchMedia by default.
            delete globalThis.matchMedia;
        });

        test('seeds the input with the current group label', () => {
            const tabGroup = fromPartial<ITabGroup>({
                label: 'My Group',
                setLabel: jest.fn(),
            });
            const input = renderRename(tabGroup);
            expect(input.value).toBe('My Group');
            expect(input.placeholder).toBe('Name This Group');
        });

        test('calls setLabel() as the user types', () => {
            const setLabel = jest.fn();
            const tabGroup = fromPartial<ITabGroup>({
                label: 'Old',
                setLabel,
            });
            const input = renderRename(tabGroup);

            fireEvent.input(input, { target: { value: 'New Name' } });
            expect(setLabel).toHaveBeenCalledWith('New Name');
        });

        test('stops propagation of non Escape/Enter keydowns', () => {
            const tabGroup = fromPartial<ITabGroup>({
                label: 'Group',
                setLabel: jest.fn(),
            });
            const input = renderRename(tabGroup);

            const letter = new KeyboardEvent('keydown', {
                key: 'a',
                bubbles: true,
                cancelable: true,
            });
            const letterSpy = jest.spyOn(letter, 'stopPropagation');
            input.dispatchEvent(letter);
            expect(letterSpy).toHaveBeenCalled();
        });

        test('lets Escape and Enter propagate (does not stop them)', () => {
            const tabGroup = fromPartial<ITabGroup>({
                label: 'Group',
                setLabel: jest.fn(),
            });
            const input = renderRename(tabGroup);

            for (const key of ['Escape', 'Enter']) {
                const event = new KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                });
                const spy = jest.spyOn(event, 'stopPropagation');
                input.dispatchEvent(event);
                expect(spy).not.toHaveBeenCalled();
            }
        });

        test('stops propagation of clicks on the input', () => {
            const tabGroup = fromPartial<ITabGroup>({
                label: 'Group',
                setLabel: jest.fn(),
            });
            const input = renderRename(tabGroup);

            const click = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
            });
            const spy = jest.spyOn(click, 'stopPropagation');
            input.dispatchEvent(click);
            expect(spy).toHaveBeenCalled();
        });

        test('auto-focuses and selects on a fine-pointer device', () => {
            const tabGroup = fromPartial<ITabGroup>({
                label: 'Group',
                setLabel: jest.fn(),
            });
            // jsdom has no matchMedia by default => treated as non-coarse, so
            // the auto-focus path runs.
            const focus = jest.spyOn(HTMLInputElement.prototype, 'focus');
            const select = jest.spyOn(HTMLInputElement.prototype, 'select');
            try {
                renderRename(tabGroup);
                expect(focus).toHaveBeenCalled();
                expect(select).toHaveBeenCalled();
            } finally {
                focus.mockRestore();
                select.mockRestore();
            }
        });

        test('skips auto-focus on a coarse (touch) primary device', () => {
            // @ts-expect-error assigning a test double for matchMedia.
            globalThis.matchMedia = (query: string) =>
                ({
                    matches: query.includes('coarse'),
                }) as MediaQueryList;

            const tabGroup = fromPartial<ITabGroup>({
                label: 'Group',
                setLabel: jest.fn(),
            });
            const raf = jest.spyOn(globalThis, 'requestAnimationFrame');
            try {
                renderRename(tabGroup);
                // The auto-focus is scheduled via requestAnimationFrame; on a
                // coarse device that scheduling is skipped entirely.
                expect(raf).not.toHaveBeenCalled();
            } finally {
                raf.mockRestore();
            }
        });
    });

    describe('ContextMenuModule', () => {
        test('the service factory builds a ContextMenuController for the host', () => {
            const { accessor } = makeAccessor();
            const factory = ContextMenuModule.services!.contextMenuService;
            const service = factory(accessor);
            expect(service).toBeInstanceOf(ContextMenuController);
        });

        test('module metadata is wired to the context menu service slot', () => {
            expect(ContextMenuModule.moduleName).toBe('ContextMenu');
            expect(Object.keys(ContextMenuModule.services ?? {})).toContain(
                'contextMenuService'
            );
            expect(ContextMenuModule.options).toEqual(
                expect.arrayContaining([
                    'getTabContextMenuItems',
                    'getTabGroupChipContextMenuItems',
                    'createContextMenuItemComponent',
                ])
            );
        });
    });
});
