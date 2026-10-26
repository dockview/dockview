import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import { DockviewReact } from '../../dockview/dockview';

// #1594: a bare mount without dockview-enterprise must not log a missing-module
// error. Own file so the process-global missing-module dedup cache is empty and
// this is the first mount that could surface the message.
describe('DockviewReact bare mount', () => {
    test('does not warn about a missing dockview-enterprise module (#1594)', async () => {
        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        try {
            const components = {
                default: (_props: IDockviewPanelProps) => <div />,
            };

            let api: DockviewApi | undefined;
            render(
                <DockviewReact
                    components={components}
                    onReady={(event: DockviewReadyEvent) => {
                        api = event.api;
                    }}
                />
            );

            await waitFor(() => expect(api).toBeTruthy());

            const enterpriseWarnings = errorSpy.mock.calls
                .map((call) => String(call[0]))
                .filter((message) => message.includes('dockview-enterprise'));

            expect(enterpriseWarnings).toEqual([]);
        } finally {
            errorSpy.mockRestore();
        }
    });
});
