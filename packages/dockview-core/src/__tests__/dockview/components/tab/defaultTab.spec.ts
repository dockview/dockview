import { DockviewApi } from '../../../../api/component.api';
import { DockviewPanelApi, TitleEvent } from '../../../../api/dockviewPanelApi';
import { DefaultTab } from '../../../../dockview/components/tab/defaultTab';
import { fromPartial } from '@total-typescript/shoehorn';
import { Emitter } from '../../../../events';
import { fireEvent } from '@testing-library/dom';
import { resolveMessages } from '../../../../dockview/accessibilityMessages';

describe('defaultTab', () => {
    test('that title updates', () => {
        const cut = new DefaultTab();

        let el = cut.element.querySelector('.dv-default-tab-content');
        expect(el).toBeTruthy();
        expect(el!.textContent).toBe('');

        const onDidTitleChange = new Emitter<TitleEvent>();

        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: onDidTitleChange.event,
        });
        const containerApi = fromPartial<DockviewApi>({});

        cut.init({
            api,
            containerApi,
            params: {},
            title: 'title_abc',
        });

        el = cut.element.querySelector('.dv-default-tab-content');
        expect(el).toBeTruthy();
        expect(el!.textContent).toBe('title_abc');

        onDidTitleChange.fire({ title: 'title_def' });

        expect(el!.textContent).toBe('title_def');
    });

    test('that click closes tab', () => {
        const cut = new DefaultTab();

        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: jest.fn(),
            close: jest.fn(),
        });
        const containerApi = fromPartial<DockviewApi>({});

        cut.init({
            api,
            containerApi,
            params: {},
            title: 'title_abc',
        });

        let el = cut.element.querySelector('.dv-default-tab-action');

        fireEvent.pointerDown(el!);
        expect(api.close).toHaveBeenCalledTimes(0);

        fireEvent.click(el!);
        expect(api.close).toHaveBeenCalledTimes(1);
    });

    test('that close button prevents default behavior', () => {
        const cut = new DefaultTab();

        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: jest.fn(),
            close: jest.fn(),
        });
        const containerApi = fromPartial<DockviewApi>({});

        cut.init({
            api,
            containerApi,
            params: {},
            title: 'title_abc',
        });

        let el = cut.element.querySelector('.dv-default-tab-action');

        const clickEvent = new Event('click', { cancelable: true });
        const preventDefaultSpy = jest.spyOn(clickEvent, 'preventDefault');

        el!.dispatchEvent(clickEvent);

        expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
        expect(api.close).toHaveBeenCalledTimes(1);
    });

    test('that close button respects already prevented events', () => {
        const cut = new DefaultTab();

        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: jest.fn(),
            close: jest.fn(),
        });
        const containerApi = fromPartial<DockviewApi>({});

        cut.init({
            api,
            containerApi,
            params: {},
            title: 'title_abc',
        });

        let el = cut.element.querySelector('.dv-default-tab-action');

        const clickEvent = new Event('click', { cancelable: true });
        clickEvent.preventDefault();

        el!.dispatchEvent(clickEvent);

        expect(api.close).not.toHaveBeenCalled();
    });

    test('that close button exposes an accessible name and hides the glyph', () => {
        const cut = new DefaultTab();

        const onDidTitleChange = new Emitter<TitleEvent>();
        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: onDidTitleChange.event,
            close: jest.fn(),
        });
        const containerApi = fromPartial<DockviewApi>({});

        const action = cut.element.querySelector(
            '.dv-default-tab-action'
        ) as HTMLElement;

        // role is set at construction, before init
        expect(action.getAttribute('role')).toBe('button');
        // focusable programmatically / by AT, but kept out of the sequential
        // tab order (the strip's roving tabindex owns that)
        expect(action.getAttribute('tabindex')).toBe('-1');
        // a plain accessible name before a title is known
        expect(action.getAttribute('aria-label')).toBe('Close');
        // the decorative glyph is hidden from assistive technology
        expect(action.querySelector('svg')!.getAttribute('aria-hidden')).toBe(
            'true'
        );

        cut.init({
            api,
            containerApi,
            params: {},
            title: 'title_abc',
        });

        // the accessible name is qualified with the panel title
        expect(action.getAttribute('aria-label')).toBe('Close title_abc');

        onDidTitleChange.fire({ title: 'title_def' });
        expect(action.getAttribute('aria-label')).toBe('Close title_def');
    });

    test('that the close button name is localised via the messages catalog', () => {
        const cut = new DefaultTab();

        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: new Emitter<TitleEvent>().event,
            close: jest.fn(),
        });
        // The app's resolved catalog is exposed on containerApi.messages; the
        // tab must read its close-button name from there, not a hardcoded string.
        const containerApi = fromPartial<DockviewApi>({
            messages: resolveMessages({
                closeTab: (title) => `Dismiss ${title}`,
                closeTabPlain: () => 'Dismiss',
            }),
        });

        const action = cut.element.querySelector(
            '.dv-default-tab-action'
        ) as HTMLElement;

        cut.init({ api, containerApi, params: {}, title: 'report' });
        expect(action.getAttribute('aria-label')).toBe('Dismiss report');
    });

    test('that close button is visible by default', () => {
        const cut = new DefaultTab();

        const api = fromPartial<DockviewPanelApi>({
            onDidTitleChange: jest.fn(),
            close: jest.fn(),
        });
        const containerApi = fromPartial<DockviewApi>({});

        cut.init({
            api,
            containerApi,
            params: {},
            title: 'title_abc',
        });

        let el = cut.element.querySelector(
            '.dv-default-tab-action'
        ) as HTMLElement;
        expect(el).toBeTruthy();
        expect(el.style.display).not.toBe('none');
    });
});
