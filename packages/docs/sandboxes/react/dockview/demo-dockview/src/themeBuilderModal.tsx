import * as React from 'react';
import { DockviewApi, DockviewTheme } from 'dockview-react';
import { ControlsContent } from './settingsModal';
import { SB } from './sidebarTheme';
import { Card, IconBtn, IconChip } from './sidebarKit';

// The demo's side panel: dock controls, plus a way into the theme builder,
// which has its own page with a dedicated preview.
export const Sidebar = (props: {
    open: boolean;
    onClose: () => void;
    theme: DockviewTheme;
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
    if (!props.open) return null;

    return (
        <div
            className="dv-sb-panel"
            style={{
                width: '332px',
                background: SB.bg,
                color: SB.text,
                borderLeft: `1px solid ${SB.border}`,
                boxShadow: SB.shadowLg,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                fontFamily: SB.ui,
            }}
        >
            <div
                style={{
                    padding: '11px 12px 11px 14px',
                    borderBottom: `1px solid ${SB.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexShrink: 0,
                }}
            >
                <IconChip icon="tune" />
                <span
                    style={{
                        marginRight: 'auto',
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '-0.01em',
                        color: SB.heading,
                    }}
                >
                    Controls
                </span>
                <IconBtn onClick={props.onClose} icon="close" title="Close" />
            </div>

            <div
                className="dv-trade-scroll"
                style={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <Card title="Theme" icon="palette" defaultOpen>
                    <div
                        style={{
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: SB.muted,
                            padding: '2px 2px 10px',
                        }}
                    >
                        Customise this theme with a live preview and export
                        it as CSS and a theme object.
                    </div>
                    <a
                        href={`/theme-builder?theme=${encodeURIComponent(props.theme.name)}`}
                        style={{
                            display: 'block',
                            textAlign: 'center',
                            padding: '7px 10px',
                            borderRadius: SB.radiusSm,
                            background: SB.accent,
                            color: SB.accentContrast,
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: 'none',
                        }}
                    >
                        Open the theme builder
                    </a>
                </Card>
                <ControlsContent
                    api={props.api}
                    panels={props.panels}
                    groups={props.groups}
                    activePanel={props.activePanel}
                    activeGroup={props.activeGroup}
                    hasCustomWatermark={props.hasCustomWatermark}
                    toggleCustomWatermark={props.toggleCustomWatermark}
                    hasCustomGhost={props.hasCustomGhost}
                    toggleCustomGhost={props.toggleCustomGhost}
                    dndCompass={props.dndCompass}
                    onToggleDndCompass={props.onToggleDndCompass}
                    smartGuides={props.smartGuides}
                    onToggleSmartGuides={props.onToggleSmartGuides}
                    proportionalLayout={props.proportionalLayout}
                    onToggleProportionalLayout={props.onToggleProportionalLayout}
                    debug={props.debug}
                    onToggleDebug={props.onToggleDebug}
                    showLogs={props.showLogs}
                    onToggleShowLogs={props.onToggleShowLogs}
                    onClearLogs={props.onClearLogs}
                />
            </div>
        </div>
    );
};
