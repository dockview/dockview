import React from 'react';
import { act, render } from '@testing-library/react';
import { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import { DockviewReact } from '../../dockview/dockview';

/**
 * Guards the React binding's re-render behaviour: panel components must render
 * once on mount, must NOT re-render on layout/resize, updating one panel must
 * not re-render its siblings, and adding a panel must not re-render the panels
 * already mounted. These invariants are what keep a panel-heavy dockview from
 * churning React work on every resize / update.
 */
describe('dockview-react render behaviour', () => {
    let renders: Record<string, number>;

    function makeComponent(): React.FunctionComponent<IDockviewPanelProps> {
        return (props: IDockviewPanelProps) => {
            const id = props.api.id;
            renders[id] = (renders[id] ?? 0) + 1;
            return <div>{id}</div>;
        };
    }

    function setup(): () => DockviewApi {
        renders = {};
        let api: DockviewApi | undefined;
        const components = { default: makeComponent() };
        render(
            <DockviewReact
                components={components}
                onReady={(e: DockviewReadyEvent) => (api = e.api)}
            />
        );
        return () => api!;
    }

    function addPanels(api: DockviewApi, n: number): void {
        for (let i = 0; i < n; i++) {
            api.addPanel({ id: `p${i}`, component: 'default' });
        }
    }

    test('each panel renders exactly once on mount', () => {
        const getApi = setup();
        act(() => {
            const api = getApi();
            api.layout(1000, 1000);
            addPanels(api, 30);
        });

        const counts = Object.values(renders);
        expect(counts).toHaveLength(30);
        expect(Math.max(...counts)).toBe(1);
    });

    test('resizing does not re-render any panel', () => {
        const getApi = setup();
        act(() => {
            const api = getApi();
            api.layout(1000, 1000);
            addPanels(api, 20);
        });

        const before = { ...renders };
        act(() => {
            const api = getApi();
            for (let i = 0; i < 50; i++) {
                api.layout(900 + i, 800 + i);
            }
        });

        expect(renders).toEqual(before);
    });

    test('updating one panel re-renders only that panel', () => {
        const getApi = setup();
        act(() => {
            const api = getApi();
            api.layout(1000, 1000);
            addPanels(api, 20);
        });

        const before = { ...renders };
        act(() => {
            getApi().getPanel('p10')?.api.updateParameters({ x: 1 });
        });

        const changed = Object.keys(renders).filter(
            (id) => renders[id] !== before[id]
        );
        expect(changed).toEqual(['p10']);
    });

    test('adding a panel does not re-render the panels already mounted', () => {
        const getApi = setup();
        act(() => {
            const api = getApi();
            api.layout(1000, 1000);
            addPanels(api, 40);
        });

        const before = { ...renders };
        act(() => {
            getApi().addPanel({ id: 'newcomer', component: 'default' });
        });

        const existingReRendered = Object.keys(before).filter(
            (id) => renders[id] !== before[id]
        );
        expect(existingReRendered).toHaveLength(0);
        expect(renders['newcomer']).toBe(1);
    });
});
