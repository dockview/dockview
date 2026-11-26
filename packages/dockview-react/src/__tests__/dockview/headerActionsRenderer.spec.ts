import {
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    DockviewGroupPanelModel,
} from 'dockview';
import { ReactHeaderActionsRendererPart } from '../../dockview/headerActionsRenderer';

describe('headerActionsRenderer', () => {
    test('#1', () => {
        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    onDidAddPanel: jest.fn(),
                    onDidRemovePanel: jest.fn(),
                    onDidChangeTabOrder: jest.fn(),
                    onDidActivePanelChange: jest.fn(),
                };
            }
        );

        const groupview = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                api: {} as DockviewGroupPanelApi as any,
                model: groupview,
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new ReactHeaderActionsRendererPart(
            jest.fn(),
            {
                addPortal: jest.fn(),
            },
            groupPanel
        );

        expect(cut.element.childNodes).toHaveLength(0);
        expect(cut.element.className).toBe('dv-react-part');
        expect(cut.part).toBeUndefined();

        cut.init({
            containerApi: <any>jest.fn(),
            api: <any>{
                onDidActiveChange: jest.fn(),
                onDidLocationChange: jest.fn(),
                location: { type: 'grid' },
            },
        });

        // a reorder within the group refreshes the `panels` prop
        expect(groupview.onDidChangeTabOrder).toHaveBeenCalled();

        const update = jest.fn();

        jest.spyOn(cut.part!, 'update').mockImplementation(update);

        cut.update({ params: { valueA: 'A' } });

        expect(update).toHaveBeenCalledWith({ valueA: 'A' });
    });
});
