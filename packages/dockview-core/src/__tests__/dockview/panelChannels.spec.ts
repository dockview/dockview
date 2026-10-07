import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewPanel, IDockviewPanel } from '../../dockview/dockviewPanel';
import { IContentRenderer } from '../../dockview/types';
import {
    DEFAULT_PANEL_CHANNELS,
    findPanelChannel,
    resolvePanelChannels,
} from '../../dockview/panelChannels';
import { DockviewComponentOptions } from '../../dockview/options';
import { _resetMissingModuleWarnings } from '../../dockview/modules';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

const custom = [{ id: 'alpha', label: 'Alpha', color: '#123456' }];

describe('panel channel helpers', () => {
    test('resolvePanelChannels returns the defaults when unset', () => {
        const options = {} as DockviewComponentOptions;
        expect(resolvePanelChannels(options)).toBe(DEFAULT_PANEL_CHANNELS);
        expect(DEFAULT_PANEL_CHANNELS.map((c) => c.id)).toEqual([
            'red',
            'orange',
            'yellow',
            'green',
            'cyan',
            'blue',
            'magenta',
            'purple',
        ]);
    });

    test('resolvePanelChannels returns the configured list, replacing the defaults', () => {
        const options = {
            panelChannels: { channels: custom },
        } as DockviewComponentOptions;
        expect(resolvePanelChannels(options)).toBe(custom);
    });

    test('findPanelChannel resolves an id or returns undefined', () => {
        const options = {} as DockviewComponentOptions;
        expect(findPanelChannel(options, 'blue')?.label).toBe('Blue');
        expect(findPanelChannel(options, 'nope')).toBeUndefined();
        expect(findPanelChannel(options, undefined)).toBeUndefined();
    });
});

/**
 * The core half of panel channels without the PanelChannels module: the state
 * on the panel, its serialization, the tab marker and the no-op public api.
 * Membership and delivery need the module and are covered in
 * dockview-enterprise.
 */
describe('panel channels without the module', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    const make = (
        options: Partial<DockviewComponentOptions> = {}
    ): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...options,
        });
        dockview.layout(1000, 1000);
        return dockview;
    };

    const add = (id: string, tabComponent?: string) =>
        dockview.addPanel({
            id,
            component: 'default',
            title: id,
            tabComponent,
        }) as DockviewPanel;

    const tabEl = (panel: IDockviewPanel): HTMLElement => {
        const id = panel.api.group.model.header.getTabId(panel.id)!;
        return document.getElementById(id)!;
    };

    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        _resetMissingModuleWarnings();
        consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        dockview?.dispose();
        container?.remove();
        consoleError.mockRestore();
    });

    test('joinChannel, leaveChannel and broadcast are silent no-ops', () => {
        make({ panelChannels: { enabled: true } });
        const a = add('a');
        consoleError.mockClear();

        a.api.joinChannel('red');
        a.api.broadcast({ type: 'x' });
        a.api.leaveChannel();

        expect(a.api.channel).toBeUndefined();
        expect(a.api.getCurrentContext()).toBeUndefined();
        expect(dockview.api.getChannelMembers('red')).toEqual([]);
        expect(dockview.api.getChannelContext('red')).toBeUndefined();
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('api.broadcastToChannel reports the missing module once', () => {
        make();
        dockview.api.broadcastToChannel('red', { type: 'x' });
        dockview.api.broadcastToChannel('red', { type: 'y' });

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError.mock.calls[0][0]).toMatch(
            /api\.broadcastToChannel/
        );
        expect(consoleError.mock.calls[0][0]).toMatch(/PanelChannels/);
    });

    test('queries never log', () => {
        make();
        expect(dockview.api.getPanelChannels()).toBe(DEFAULT_PANEL_CHANNELS);
        dockview.api.clearChannelContexts();
        dockview.api.clearChannelContexts('red');
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('getPanelChannels reflects the configured list', () => {
        make({ panelChannels: { enabled: true, channels: custom } });
        expect(dockview.api.getPanelChannels()).toBe(custom);
    });

    describe('serialization', () => {
        test('toJSON omits channel when unset and emits it when set', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            expect('channel' in a.toJSON()).toBe(true);
            expect(a.toJSON().channel).toBeUndefined();
            expect(JSON.stringify(a.toJSON())).not.toContain('channel');

            a.setChannel('red');

            expect(a.toJSON().channel).toBe('red');
        });

        test('fromJSON restores the channel when enabled and known', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            a.setChannel('red');
            const json = dockview.toJSON();

            dockview.fromJSON(json);

            const restored = dockview.getGroupPanel('a')!;
            expect(restored.api.channel).toBe('red');
            expect(tabEl(restored).dataset.channel).toBe('red');
        });

        test('fromJSON ignores the channel when the option is unset', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            a.setChannel('red');
            const json = dockview.toJSON();
            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);

            dockview.updateOptions({ panelChannels: undefined });
            dockview.fromJSON(json);

            expect(dockview.getGroupPanel('a')!.api.channel).toBeUndefined();
            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        });

        test('fromJSON ignores an unknown channel id and warns once', () => {
            make({ panelChannels: { enabled: true } });
            add('a');
            add('b');
            const json = dockview.toJSON();
            json.panels['a'].channel = 'vanished';
            json.panels['b'].channel = 'vanished';
            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);

            dockview.fromJSON(json);

            expect(dockview.getGroupPanel('a')!.api.channel).toBeUndefined();
            expect(dockview.getGroupPanel('b')!.api.channel).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toMatch(/"vanished"/);
            warn.mockRestore();
        });

        test('fromJSON with reuseExistingPanels applies the restored channel to the kept panel', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            a.setChannel('red');
            const json = dockview.toJSON();
            a.setChannel(undefined);

            dockview.fromJSON(json, { reuseExistingPanels: true });

            expect(dockview.getGroupPanel('a')).toBe(a);
            expect(a.api.channel).toBe('red');
            expect(tabEl(a).dataset.channel).toBe('red');
        });
    });

    describe('tab marker', () => {
        test('is injected for the default renderer with colour and accessible name', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            const tab = tabEl(a);
            expect(tab.classList.contains('dv-tab--channel')).toBe(false);
            expect(tab.querySelector('.dv-tab-channel')).toBeNull();

            a.setChannel('red');

            expect(tab.classList.contains('dv-tab--channel')).toBe(true);
            expect(tab.dataset.channel).toBe('red');
            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe(
                'var(--dv-channel-color-red)'
            );
            const marker = tab.querySelector('.dv-tab-channel')!;
            expect(marker.getAttribute('role')).toBe('img');
            expect(marker.getAttribute('aria-label')).toBe('Linked to Red');
            expect(marker.getAttribute('title')).toBe('Linked to Red');
            expect(marker.getAttribute('aria-label')).toBe(
                marker.getAttribute('title')
            );
        });

        test('is removed on leave', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            a.setChannel('red');
            const tab = tabEl(a);

            a.setChannel(undefined);

            expect(tab.classList.contains('dv-tab--channel')).toBe(false);
            expect(tab.dataset.channel).toBeUndefined();
            expect(tab.querySelector('.dv-tab-channel')).toBeNull();
            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe('');
        });

        test('uses the messages option for the accessible name', () => {
            make({
                panelChannels: { enabled: true },
                messages: { channelIndicator: (c) => `Canal ${c}` },
            });
            const a = add('a');
            a.setChannel('blue');
            expect(
                tabEl(a)
                    .querySelector('.dv-tab-channel')!
                    .getAttribute('aria-label')
            ).toBe('Canal Blue');
        });

        test('a custom tab renderer gets the class and colour but no marker', () => {
            make({
                panelChannels: { enabled: true },
                createTabComponent: () => ({
                    element: (() => {
                        const e = document.createElement('div');
                        e.className = 'my-custom-tab';
                        return e;
                    })(),
                    init: () => undefined,
                    dispose: () => undefined,
                }),
            });
            const a = add('a', 'custom');

            a.setChannel('red');

            const tab = tabEl(a);
            expect(tab.classList.contains('dv-tab--channel')).toBe(true);
            expect(tab.dataset.channel).toBe('red');
            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe(
                'var(--dv-channel-color-red)'
            );
            expect(tab.querySelector('.dv-tab-channel')).toBeNull();
            expect(tab.querySelector('.my-custom-tab')).not.toBeNull();
        });

        test('survives a reorder, which recreates the tab', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            const b = add('b');
            add('c');
            b.setChannel('green');

            a.api.moveTo({ index: 2 });

            const tab = tabEl(b);
            expect(tab.classList.contains('dv-tab--channel')).toBe(true);
            expect(tab.querySelector('.dv-tab-channel')).not.toBeNull();
        });

        test('sits after the pin glyph when both are present', () => {
            make({
                panelChannels: { enabled: true },
                pinnedTabs: { enabled: true },
            });
            const a = add('a');
            a.setChannel('red');
            a.setPinned(true);

            const children = Array.from(tabEl(a).children).map(
                (el) => el.className
            );
            expect(children.slice(0, 2)).toEqual([
                'dv-tab-pin',
                'dv-tab-channel',
            ]);
        });

        test('re-resolves the colour when the channel list changes', () => {
            make({ panelChannels: { enabled: true } });
            const a = add('a');
            a.setChannel('red');
            const tab = tabEl(a);

            dockview.updateOptions({
                panelChannels: {
                    enabled: true,
                    channels: [{ id: 'red', label: 'Rouge', color: 'crimson' }],
                },
            });

            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe(
                'crimson'
            );
            expect(
                tab.querySelector('.dv-tab-channel')!.getAttribute('aria-label')
            ).toBe('Linked to Rouge');
        });
    });
});
