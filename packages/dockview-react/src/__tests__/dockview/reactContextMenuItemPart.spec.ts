import { fromPartial } from '@total-typescript/shoehorn';
import {
    IChipContextMenuItemComponentProps,
    IContextMenuItemComponentProps,
} from 'dockview';
import { ReactContextMenuItemPart } from '../../dockview/reactContextMenuItemPart';
import { ReactPortalStore } from '../../react';

describe('ReactContextMenuItemPart', () => {
    test('element has class dv-react-part with full dimensions', () => {
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({ addPortal: jest.fn() })
        );

        expect(cut.element.className).toBe('dv-react-part');
        expect(cut.element.style.height).toBe('100%');
        expect(cut.element.style.width).toBe('100%');
    });

    test('part is undefined before init', () => {
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({ addPortal: jest.fn() })
        );

        expect(cut.part).toBeUndefined();
    });

    test('init creates a ReactPart and registers a portal', () => {
        const addPortal = jest.fn().mockReturnValue({ dispose: jest.fn() });
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({ addPortal })
        );

        const props = fromPartial<IContextMenuItemComponentProps>({
            panel: {} as any,
            group: {} as any,
            api: {} as any,
            close: jest.fn(),
        });

        cut.init(props);

        expect(cut.part).toBeDefined();
        expect(addPortal).toHaveBeenCalled();
    });

    test('init passes componentProps through to the ReactPart parameters', () => {
        const addPortal = jest.fn().mockReturnValue({ dispose: jest.fn() });
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({ addPortal })
        );

        const componentProps = { foo: 'bar' };
        const props: IContextMenuItemComponentProps = {
            panel: {} as any,
            group: {} as any,
            api: {} as any,
            close: jest.fn(),
            componentProps,
        };

        cut.init(props);

        // ReactPart stores the full props as `parameters` and passes them to
        // the bridge component as `componentProps`, making them available to
        // the user's React component as direct props.
        const parameters = (cut.part as any)
            .parameters as IContextMenuItemComponentProps;
        expect(parameters.componentProps).toBe(componentProps);
    });

    test('init forwards chip props (tabGroup) to the ReactPart parameters', () => {
        // The same renderer serves the tab group chip context menu, whose props
        // carry a `tabGroup` instead of a `panel`; the componentProps test above
        // already covers the pass-through, so this only checks the tabGroup key.
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({
                addPortal: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            })
        );
        const tabGroup = {} as any;

        cut.init(fromPartial<IChipContextMenuItemComponentProps>({ tabGroup }));

        expect((cut.part as any).parameters.tabGroup).toBe(tabGroup);
    });

    test('dispose cleans up the part', () => {
        const addPortal = jest.fn().mockReturnValue({ dispose: jest.fn() });
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({ addPortal })
        );

        cut.init(
            fromPartial<IContextMenuItemComponentProps>({
                panel: {} as any,
                group: {} as any,
                api: {} as any,
                close: jest.fn(),
            })
        );

        const disposeSpy = jest.spyOn(cut.part!, 'dispose');
        cut.dispose();
        expect(disposeSpy).toHaveBeenCalled();
    });

    test('dispose before init does not throw', () => {
        const cut = new ReactContextMenuItemPart(
            'id-1',
            jest.fn(),
            fromPartial<ReactPortalStore>({ addPortal: jest.fn() })
        );

        expect(() => cut.dispose()).not.toThrow();
    });
});
