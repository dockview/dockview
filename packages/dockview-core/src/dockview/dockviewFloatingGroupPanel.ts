import { Overlay } from '../overlay/overlay';
import { CompositeDisposable } from '../lifecycle';
import { Emitter, Event } from '../events';
import { Gridview } from '../gridview/gridview';
import { AnchoredBox } from '../types';
import { DockviewGroupPanel, IDockviewGroupPanel } from './dockviewGroupPanel';

export interface IDockviewFloatingGroupPanel {
    readonly group: IDockviewGroupPanel;
    position(bounds: Partial<AnchoredBox>): void;
}

/**
 * The subset of the dedicated floating title bar this panel needs to keep in
 * sync. Declared structurally to avoid a circular import on `FloatingTitleBar`.
 */
export interface IAnchorTrackingTitleBar {
    setGroup(group: DockviewGroupPanel): void;
}

export class DockviewFloatingGroupPanel
    extends CompositeDisposable
    implements IDockviewFloatingGroupPanel
{
    private _group: DockviewGroupPanel;
    private _titleBar: IAnchorTrackingTitleBar | undefined;

    private readonly _onDidChangeAnchorGroup =
        new Emitter<DockviewGroupPanel>();
    /** Fires with the new anchor after `setAnchorGroup` reassigns it. */
    readonly onDidChangeAnchorGroup: Event<DockviewGroupPanel> =
        this._onDidChangeAnchorGroup.event;

    /**
     * The window's representative/anchor group. A floating window can host a
     * nested layout of several groups; the anchor is used for back-compat
     * single-group APIs and is reassigned if it leaves the window.
     */
    get group(): DockviewGroupPanel {
        return this._group;
    }

    /**
     * Register the dedicated title bar (if any) so anchor reassignment keeps
     * its drag handle pointed at a group that still lives in this window.
     */
    setTitleBar(titleBar: IAnchorTrackingTitleBar | undefined): void {
        this._titleBar = titleBar;
    }

    setAnchorGroup(group: DockviewGroupPanel): void {
        this._group = group;
        this._titleBar?.setGroup(group);
        this._onDidChangeAnchorGroup.fire(group);
    }

    constructor(
        group: DockviewGroupPanel,
        readonly overlay: Overlay,
        /**
         * The floating window hosts its own gridview so it can hold a nested
         * splitview layout of groups, not just a single group.
         */
        readonly gridview: Gridview
    ) {
        super();
        this._group = group;
        this.addDisposables(this._onDidChangeAnchorGroup, overlay, {
            // The gridview owns the floating window's DOM subtree (mounted as
            // the overlay's content). Disposing it tears down the splitview;
            // it doesn't dispose the leaf views (groups), whose lifecycle is
            // owned by the component's `_groups` map.
            dispose: () => this.gridview.dispose(),
        });
    }

    position(bounds: Partial<AnchoredBox>): void {
        this.overlay.setBounds(bounds);
    }
}
