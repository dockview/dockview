import { PanelUpdateEvent } from '../../panel/types';
import { PaneviewComponent } from '../../paneview/paneviewComponent';
import {
    IPanePart,
    PanePanelComponentInitParameter,
    PaneviewPanel,
} from '../../paneview/paneviewPanel';
import { Orientation } from '../../splitview/splitview';

class RecordingPart implements IPanePart {
    readonly element = document.createElement('div');
    readonly update = jest.fn<void, [PanelUpdateEvent]>();
    readonly init = jest.fn<void, [PanePanelComponentInitParameter]>();
    readonly dispose = jest.fn();
}

// Captured through the factory methods rather than instance fields: core may
// construct the parts before a subclass's field initialisers have run.
const recorders = { body: new RecordingPart(), header: new RecordingPart() };

class TestPanel extends PaneviewPanel {
    constructor(id: string, component: string) {
        super({
            id,
            component,
            headerComponent: 'header',
            orientation: Orientation.VERTICAL,
            isExpanded: true,
            isHeaderVisible: true,
            headerSize: 22,
            minimumBodySize: 0,
            maximumBodySize: Number.MAX_SAFE_INTEGER,
        });
    }

    getHeaderComponent(): IPanePart {
        return recorders.header;
    }

    getBodyComponent(): IPanePart {
        return recorders.body;
    }
}

describe('paneviewPanel', () => {
    test('body and header parts receive a single-wrapped PanelUpdateEvent on update and on layout', () => {
        const container = document.createElement('div');
        const paneview = new PaneviewComponent(container, {
            createComponent: (options) =>
                new TestPanel(options.id, options.name),
        });
        paneview.layout(300, 600);

        const panel = paneview.addPanel({
            id: 'panel1',
            component: 'default',
            title: 'Panel 1',
            params: { a: 1 },
        });

        recorders.body.update.mockClear();
        recorders.header.update.mockClear();

        panel.api.updateParameters({ b: 2 });

        // `PaneviewPanel.getComponent` must not re-wrap the event core already
        // built, otherwise the parts see `{ params: { params: {...} } }`.
        expect(recorders.body.update).toHaveBeenLastCalledWith({
            params: { a: 1, b: 2 },
        });
        expect(recorders.header.update).toHaveBeenLastCalledWith({
            params: { a: 1, b: 2 },
        });

        recorders.body.update.mockClear();
        recorders.header.update.mockClear();

        paneview.layout(400, 700);

        expect(recorders.body.update).toHaveBeenCalled();
        for (const call of recorders.body.update.mock.calls) {
            expect(call[0]).toEqual({ params: { a: 1, b: 2 } });
        }
        for (const call of recorders.header.update.mock.calls) {
            expect(call[0]).toEqual({ params: { a: 1, b: 2 } });
        }

        paneview.dispose();
    });
});
