import { DockviewApi } from 'dockview-react';
import * as React from 'react';
import { GridActions } from './gridActions';
import { PanelActions } from './panelActions';
import { GroupActions } from './groupActions';
import { SB } from './sidebarTheme';
import { Card, Switch, Btn } from './sidebarKit';

const Kbd = (props: { children: React.ReactNode }) => (
    <kbd
        style={{
            display: 'inline-block',
            padding: '1px 6px',
            fontSize: 10,
            fontFamily: SB.mono,
            lineHeight: '16px',
            border: `1px solid ${SB.border}`,
            borderBottomWidth: 2,
            borderRadius: 4,
            background: SB.surface,
            color: SB.muted,
            whiteSpace: 'nowrap',
        }}
    >
        {props.children}
    </kbd>
);

// Read-only reference. Mirrors the enabled `keyboardNavigation` bindings:
// KeyboardNavigation (nav) + KeyboardDocking (move). Keep in sync with
// DEFAULT_KEYMAP in dockview-enterprise if the defaults change.
const SHORTCUTS: { label: string; keys: string[] }[] = [
    { label: 'Focus next / previous group', keys: ['F6', '⇧ F6'] },
    { label: 'Focus group by direction', keys: ['Ctrl ⇧ ←↑↓→'] },
    { label: 'Next / previous tab in group', keys: ['Ctrl ]', 'Ctrl ['] },
    { label: 'Focus the tab strip', keys: ['Ctrl ⇧ \\'] },
    { label: 'Move panel: arm', keys: ['Ctrl M'] },
    { label: '…then pick target / edge', keys: ['←↑↓→'] },
    { label: '…tab into group (centre)', keys: ['Space', 'C'] },
    { label: '…commit / cancel', keys: ['Enter', 'Esc'] },
    { label: '…float instead of dock', keys: ['Ctrl ⇧ F'] },
];

const KeyboardShortcuts = () => (
    <div style={{ padding: '2px 0' }}>
        {SHORTCUTS.map((row) => (
            <div
                key={row.label}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '4px 0',
                    fontSize: 11.5,
                    color: SB.text,
                    fontFamily: SB.ui,
                }}
            >
                <span>{row.label}</span>
                <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {row.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                    ))}
                </span>
            </div>
        ))}
    </div>
);

export const ControlsContent = (props: {
    api?: DockviewApi;
    panels: string[];
    groups: string[];
    activePanel?: string;
    activeGroup?: string;
    hasCustomWatermark: boolean;
    toggleCustomWatermark: () => void;
    hasCustomGhost: boolean;
    toggleCustomGhost: () => void;
    dndCompass: boolean;
    onToggleDndCompass: () => void;
    smartGuides: boolean;
    onToggleSmartGuides: () => void;
    proportionalLayout: boolean;
    onToggleProportionalLayout: () => void;
    debug: boolean;
    onToggleDebug: () => void;
    showLogs: boolean;
    onToggleShowLogs: () => void;
    onClearLogs: () => void;
}) => {
    return (
        <>
            <Card title="Grid" icon="grid_view" defaultOpen>
                <GridActions api={props.api} />
            </Card>

            {props.api && props.activePanel && (
                <Card title="Active Panel" icon="web_asset" defaultOpen>
                    <PanelActions
                        api={props.api}
                        panels={[props.activePanel]}
                        activePanel={props.activePanel}
                    />
                </Card>
            )}

            {props.api && props.activeGroup && (
                <Card title="Active Group" icon="space_dashboard" defaultOpen>
                    <GroupActions
                        api={props.api}
                        groups={[props.activeGroup]}
                        activeGroup={props.activeGroup}
                    />
                </Card>
            )}

            <Card title="View" icon="visibility" defaultOpen>
                <Switch
                    label="Debug overlay"
                    icon="engineering"
                    checked={props.debug}
                    onChange={props.onToggleDebug}
                />
                <Switch
                    label="Events log"
                    icon="terminal"
                    checked={props.showLogs}
                    onChange={props.onToggleShowLogs}
                />
                <Switch
                    label="Custom watermark"
                    icon="branding_watermark"
                    checked={props.hasCustomWatermark}
                    onChange={props.toggleCustomWatermark}
                />
                <Switch
                    label="Custom drag ghost"
                    icon="drag_indicator"
                    checked={props.hasCustomGhost}
                    onChange={props.toggleCustomGhost}
                />
                <Switch
                    label="DnD compass"
                    icon="explore"
                    checked={props.dndCompass}
                    onChange={props.onToggleDndCompass}
                />
                <Switch
                    label="Smart guides"
                    icon="straighten"
                    checked={props.smartGuides}
                    onChange={props.onToggleSmartGuides}
                />
                <Switch
                    label="Proportional layout"
                    icon="aspect_ratio"
                    checked={props.proportionalLayout}
                    onChange={props.onToggleProportionalLayout}
                />
                {props.showLogs && (
                    <div style={{ paddingTop: 6 }}>
                        <Btn onClick={props.onClearLogs} icon="undo">
                            Clear log
                        </Btn>
                    </div>
                )}
            </Card>

            <Card title="Keyboard shortcuts" icon="keyboard">
                <KeyboardShortcuts />
            </Card>
        </>
    );
};
