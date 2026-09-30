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
     * Skip this target during hit-testing so the ancestor walk continues past
     * it. A target that merely declines on drop still shadows its ancestors.
     */
    isHitTestTransparent?(): boolean;
}
