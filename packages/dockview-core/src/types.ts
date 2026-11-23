export type FunctionOrValue<T> = (() => T) | T;

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export interface Box {
    left: number;
    top: number;
    height: number;
    width: number;
}

/** Keyboard modifier state captured from a pointer event (e.g. for snapping
 *  gates that suspend while a modifier is held). */
export interface DragModifiers {
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
}

type TopLeft = { top: number; left: number };
type TopRight = { top: number; right: number };
type BottomLeft = { bottom: number; left: number };
type BottomRight = { bottom: number; right: number };

export type AnchorPosition = TopLeft | TopRight | BottomLeft | BottomRight;
export type Size = { width: number; height: number };

export type AnchoredBox = Size & AnchorPosition;

/** Why `onDidLayoutChange` fired. Only `'geometry'` (sizes / positions,
 *  including maximize, visibility and floating / popout bounds) is a resize;
 *  the rest are serialized too, which is why they fire the event. */
export type LayoutChangeReason =
    | 'geometry'
    | 'structure'
    | 'activePanel'
    | 'panelTitle'
    | 'panelParameters';

/** `onDidLayoutChange` payload: the union of reasons since the previous
 *  (coalesced) fire. */
export interface LayoutChangeEvent {
    readonly reasons: ReadonlySet<LayoutChangeReason>;
}
