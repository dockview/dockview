import { DockviewComponentOptions } from '../../dockview/options';
import {
    OPTION_MODULE_RULES,
    validateOptionModules,
} from '../../dockview/optionsModules';
import {
    ENTERPRISE_MODULE_NAMES,
    _resetMissingModuleWarnings,
} from '../../dockview/modules';
import { AllModules } from '../../dockview/allModules';

const nothingRegistered = () => false;
const everythingRegistered = () => true;

function options(o: Partial<DockviewComponentOptions>) {
    return o;
}

describe('validateOptionModules', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        _resetMissingModuleWarnings();
        consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    test('says nothing for options that request no module', () => {
        validateOptionModules(
            options({ theme: undefined, scrollbars: 'custom' }),
            nothingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('says nothing when the module is registered', () => {
        validateOptionModules(
            options({ overflow: { mode: 'wrap' } }),
            everythingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('reports the module and the exact option path that needed it', () => {
        validateOptionModules(
            options({ overflow: { mode: 'wrap' } }),
            nothingRegistered
        );
        expect(consoleError).toHaveBeenCalledTimes(1);
        const message = consoleError.mock.calls[0][0];
        expect(message).toMatch(/overflow\.mode: 'wrap'/);
        expect(message).toMatch(/MultiRowTabs/);
        expect(message).toMatch(/npm install dockview-enterprise/);
    });

    test('one option key can require different modules by value', () => {
        validateOptionModules(
            options({ overflow: { mode: 'wrap', search: true } }),
            nothingRegistered
        );
        const messages = consoleError.mock.calls.map((c) => c[0]).join('\n');
        expect(messages).toMatch(/MultiRowTabs/);
        expect(messages).toMatch(/AdvancedOverflow/);
    });

    test('one message per missing module, however many of its options are set', () => {
        validateOptionModules(
            options({
                overflow: { mode: 'wrap', maxRows: 3, search: true, mru: true },
            }),
            nothingRegistered
        );

        // Two modules missing, four options set: two messages, not four.
        expect(consoleError).toHaveBeenCalledTimes(2);

        const multiRow = consoleError.mock.calls
            .map((c) => c[0] as string)
            .find((m) => m.includes('MultiRowTabs'))!;
        expect(multiRow).toMatch(/overflow\.mode: 'wrap'/);
        expect(multiRow).toMatch(/overflow\.maxRows/);
        // Grammar tracks the count, and the fix is stated once.
        expect(multiRow).toMatch(/require the "MultiRowTabs" module/);
        expect(multiRow.match(/npm install/g)).toHaveLength(1);
    });

    test('a single reason still reads as singular', () => {
        validateOptionModules(
            options({ overflow: { mode: 'wrap' } }),
            nothingRegistered
        );
        expect(consoleError.mock.calls[0][0]).toMatch(
            /requires the "MultiRowTabs" module/
        );
    });

    test('dockToEdgeGroups requires AutoEdgeGroup, a paid feature end to end', () => {
        validateOptionModules(
            options({ dockToEdgeGroups: true }),
            nothingRegistered
        );
        expect(consoleError.mock.calls[0][0]).toMatch(/AutoEdgeGroup/);
    });

    test('edgeGroupPeek alone does not demand enterprise', () => {
        validateOptionModules(
            options({ edgeGroupPeek: { animate: false } }),
            nothingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('the context menu options never demand enterprise', () => {
        // ContextMenu is a built-in module, so none of these can go unserved.
        validateOptionModules(
            options({
                getTabContextMenuItems: () => [],
                getTabGroupChipContextMenuItems: () => [],
                createContextMenuItemComponent: () => undefined,
            }),
            nothingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('an explicitly disabled feature is silent', () => {
        validateOptionModules(
            options({
                smartGuides: { enabled: false },
                pinnedTabs: { enabled: false },
                layoutHistory: { enabled: false },
                autoHideEdgeGroups: false,
                dockToEdgeGroups: { left: false },
                dndCompass: false,
                keyboardNavigation: false,
                overflow: { search: false, mru: false },
            }),
            nothingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    // Enumerated rather than hand-listed: the hand-listed test above missed
    // `dndCompass: false`, which fired because its rule tested presence rather
    // than truthiness. A rule that can't be expressed as a plain `false` is
    // skipped: every such option here nests its own opt-out, covered above.
    test.each([
        ['dndCompass'],
        ['keyboardNavigation'],
        ['autoHideEdgeGroups'],
        ['dockToEdgeGroups'],
        ['smartGuides'],
    ])('`%s: false` is an opt-out, never a purchase prompt', (key) => {
        validateOptionModules(
            options({ [key]: false } as Partial<DockviewComponentOptions>),
            nothingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();
    });

    test('smartGuides is enabled by presence', () => {
        validateOptionModules(options({ smartGuides: {} }), nothingRegistered);
        expect(consoleError.mock.calls[0][0]).toMatch(/SmartGuides/);
    });

    test('layoutHistory is dormant until enabled', () => {
        validateOptionModules(
            options({ layoutHistory: {} }),
            nothingRegistered
        );
        expect(consoleError).not.toHaveBeenCalled();

        validateOptionModules(
            options({ layoutHistory: { enabled: true } }),
            nothingRegistered
        );
        expect(consoleError.mock.calls[0][0]).toMatch(/LayoutHistory/);
    });

    test('a per-edge set fires when any edge is enabled', () => {
        validateOptionModules(
            options({ autoHideEdgeGroups: { left: true } }),
            nothingRegistered
        );
        expect(consoleError.mock.calls[0][0]).toMatch(/AutoHideEdgeGroup/);
    });

    test('logs once per module+reason across repeated validation', () => {
        for (let i = 0; i < 3; i++) {
            validateOptionModules(
                options({ overflow: { mode: 'wrap' } }),
                nothingRegistered
            );
        }
        expect(consoleError).toHaveBeenCalledTimes(1);
    });
});

describe('OPTION_MODULE_RULES', () => {
    test('every rule names a known module', () => {
        // Derived from AllModules rather than hardcoded, so adding or renaming
        // a core module can't leave this list stale. Guards against a typo'd
        // module name silently never matching (and so never warning).
        const coreModules = new Set(AllModules.map((m) => m.moduleName));

        for (const rule of OPTION_MODULE_RULES) {
            const known =
                ENTERPRISE_MODULE_NAMES.has(rule.moduleName) ||
                coreModules.has(rule.moduleName);
            expect([rule.reason, known]).toEqual([rule.reason, true]);
        }
    });

    test('no rule fires on empty options', () => {
        for (const rule of OPTION_MODULE_RULES) {
            expect([rule.reason, rule.when({})]).toEqual([rule.reason, false]);
        }
    });
});
