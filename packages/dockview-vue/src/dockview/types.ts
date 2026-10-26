import {
    type DockviewDidDropEvent,
    type DockviewOptions,
    type DockviewReadyEvent,
    type DockviewWillDropEvent,
    type IDockviewHeaderActionsProps,
    type IDockviewPanelHeaderProps,
    type IDockviewPanelProps,
    type IWatermarkPanelProps,
} from 'dockview';
import type { VueComponent } from '../utils';

export interface VueProps {
    components?: Record<string, VueComponent>;
    tabComponents?: Record<string, VueComponent>;
    watermarkComponent?: string | VueComponent;
    defaultTabComponent?: string | VueComponent;
    rightHeaderActionsComponent?: string | VueComponent;
    leftHeaderActionsComponent?: string | VueComponent;
    prefixHeaderActionsComponent?: string | VueComponent;
    tabGroupChipComponent?: string | VueComponent;
    groupDragGhostComponent?: string | VueComponent;
}

export type VueEvents = {
    ready: [event: DockviewReadyEvent];
    didDrop: [event: DockviewDidDropEvent];
    willDrop: [event: DockviewWillDropEvent];
};

/**
 * Scoped slots accepted by `<DockviewVue>`. A slot takes precedence over the
 * equivalent component prop; when a slot is absent the prop is used.
 *
 * - `panel-<name>` renders panels added with `component: '<name>'`.
 * - `tab-<name>` renders tabs added with `tabComponent: '<name>'`.
 * - `defaultTab` renders every tab without a `tabComponent`.
 * - `watermark`, `rightHeaderActions`, `leftHeaderActions` and
 *   `prefixHeaderActions` replace the matching `*Component` props.
 *
 * Slot props are the same objects a component receives as its `params` prop.
 */
export type DockviewVueSlots = {
    [panel: `panel-${string}`]: (props: IDockviewPanelProps) => any;
    [tab: `tab-${string}`]: (props: IDockviewPanelHeaderProps) => any;
} & {
    defaultTab?: (props: IDockviewPanelHeaderProps) => any;
    watermark?: (props: IWatermarkPanelProps) => any;
    rightHeaderActions?: (props: IDockviewHeaderActionsProps) => any;
    leftHeaderActions?: (props: IDockviewHeaderActionsProps) => any;
    prefixHeaderActions?: (props: IDockviewHeaderActionsProps) => any;
};

export type IDockviewVueProps = DockviewOptions & VueProps;
