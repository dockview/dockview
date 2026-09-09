import { Position } from '../droptarget';

export interface PointerDragEvent {
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerEvent: PointerEvent;
}

export interface PointerDroptargetEvent {
    readonly position: Position;
    readonly nativeEvent: PointerEvent;
}

export interface IPointerDropTargetHandle {
    readonly element: HTMLElement;
    handleDragOver(event: PointerDragEvent): void;
    handleDragLeave(): void;
    handleDrop(event: PointerDragEvent): void;
    /**
     * When present and truthy the target is skipped during hit-testing, so the
     * ancestor walk continues past it to the next registered target. Lets a
     * target act as a hit-test stop for some payloads only; a target that is
     * merely inert on drop would otherwise still shadow its ancestors.
     */
    isHitTestTransparent?(): boolean;
}
