import {
    DEFAULT_MESSAGES,
    resolveMessages,
} from '../../dockview/accessibilityMessages';

describe('accessibilityMessages', () => {
    describe('DEFAULT_MESSAGES', () => {
        test('panel + group lifecycle announcements', () => {
            expect(DEFAULT_MESSAGES.panelOpened('Logs')).toBe('Logs opened');
            expect(DEFAULT_MESSAGES.panelClosed('Logs')).toBe('Logs closed');
            expect(DEFAULT_MESSAGES.groupMaximized('A')).toBe('A maximized');
            expect(DEFAULT_MESSAGES.groupRestored('A')).toBe('A restored');
            expect(DEFAULT_MESSAGES.groupFloated('A')).toBe('A floated');
            expect(DEFAULT_MESSAGES.groupDocked('A')).toBe('A docked');
            expect(DEFAULT_MESSAGES.groupPoppedOut('A')).toBe(
                'A opened in a new window'
            );
        });

        test('tab close labels', () => {
            expect(DEFAULT_MESSAGES.closeTab('Editor')).toBe('Close Editor');
            expect(DEFAULT_MESSAGES.closeTabPlain()).toBe('Close');
        });

        test('move: target-phase prompt includes position and progress', () => {
            expect(DEFAULT_MESSAGES.movePickTarget('Src', 'Dst', 2, 5)).toBe(
                'Moving Src. Target Dst, 2 of 5. Enter to choose where, Escape to cancel.'
            );
        });

        test('move: edge-phase prompt reads "Tab into" for center', () => {
            expect(DEFAULT_MESSAGES.movePickEdge('center', 'Dst')).toBe(
                'Tab into Dst. Arrows to change, Enter to confirm, Escape to go back.'
            );
        });

        test('move: edge-phase prompt reads "Split <side>" for an edge', () => {
            expect(DEFAULT_MESSAGES.movePickEdge('left', 'Dst')).toBe(
                'Split left of Dst. Arrows to change, Enter to confirm, Escape to go back.'
            );
        });

        test('move: commit sentence reads "docked into" for center', () => {
            expect(DEFAULT_MESSAGES.moveCommitted('Src', 'Dst', 'center')).toBe(
                'Src docked into Dst.'
            );
        });

        test('move: commit sentence reads "split <side>" for an edge', () => {
            expect(DEFAULT_MESSAGES.moveCommitted('Src', 'Dst', 'bottom')).toBe(
                'Src split bottom of Dst.'
            );
        });

        test('move: terminal announcements', () => {
            expect(DEFAULT_MESSAGES.moveCancelled()).toBe('Move cancelled.');
            expect(DEFAULT_MESSAGES.moveNotAllowed()).toBe(
                'That move is not allowed.'
            );
            expect(DEFAULT_MESSAGES.moveFloated('Src')).toBe('Src floated.');
        });
    });

    test('stacked edge groups', () => {
        expect(DEFAULT_MESSAGES.edgeGroupStacked('Explorer', 'left')).toBe(
            'Explorer docked in a new left group'
        );
    });

    describe('resolveMessages', () => {
        test('returns the defaults verbatim when no overrides are given', () => {
            expect(resolveMessages()).toBe(DEFAULT_MESSAGES);
            expect(resolveMessages(undefined)).toBe(DEFAULT_MESSAGES);
        });

        test('layers a partial override over the defaults', () => {
            const resolved = resolveMessages({
                panelOpened: (title) => `opened ${title}`,
            });
            // overridden entry wins...
            expect(resolved.panelOpened('X')).toBe('opened X');
            // ...untouched entries keep the English defaults.
            expect(resolved.panelClosed('X')).toBe('X closed');
            // and the defaults object itself is not mutated.
            expect(DEFAULT_MESSAGES.panelOpened('X')).toBe('X opened');
        });
    });
});
