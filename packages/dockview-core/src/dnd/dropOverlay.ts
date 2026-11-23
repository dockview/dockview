// Two render paths: in-place (dropzone appended to drop element) and
// anchored (overlay rendered into an external anchor container).

import { toggleClass } from '../dom';
import { clamp } from '../math';
import {
    DropTargetTargetModel,
    DroptargetOverlayModel,
    MeasuredValue,
    Position,
} from './droptarget';

const DEFAULT_SIZE: MeasuredValue = { value: 50, type: 'percentage' };
const SMALL_WIDTH_BOUNDARY = 100;
const SMALL_HEIGHT_BOUNDARY = 100;

export interface OverlayElements {
    dropzone: HTMLElement;
    selection: HTMLElement;
}

export function createOverlayElements(): OverlayElements {
    const dropzone = document.createElement('div');
    dropzone.className = 'dv-drop-target-dropzone';
    const selection = document.createElement('div');
    selection.className = 'dv-drop-target-selection';
    dropzone.appendChild(selection);
    return { dropzone, selection };
}

interface OverlayShape {
    isSmallX: boolean;
    isSmallY: boolean;
    isLeft: boolean;
    isRight: boolean;
    isTop: boolean;
    isBottom: boolean;
    rightClass: boolean;
    leftClass: boolean;
    topClass: boolean;
    bottomClass: boolean;
    size: number;
}

function computeOverlayShape(
    quadrant: Position,
    width: number,
    height: number,
    overlayModel?: DroptargetOverlayModel
): OverlayShape {
    const smallWidthBoundary =
        overlayModel?.smallWidthBoundary ?? SMALL_WIDTH_BOUNDARY;
    const smallHeightBoundary =
        overlayModel?.smallHeightBoundary ?? SMALL_HEIGHT_BOUNDARY;
    const isSmallX = width < smallWidthBoundary;
    const isSmallY = height < smallHeightBoundary;

    const isLeft = quadrant === 'left';
    const isRight = quadrant === 'right';
    const isTop = quadrant === 'top';
    const isBottom = quadrant === 'bottom';

    const rightClass = !isSmallX && isRight;
    const leftClass = !isSmallX && isLeft;
    const topClass = !isSmallY && isTop;
    const bottomClass = !isSmallY && isBottom;

    let size = 1;
    const sizeOptions = overlayModel?.size ?? DEFAULT_SIZE;
    if (sizeOptions.type === 'percentage') {
        size = clamp(sizeOptions.value, 0, 100) / 100;
    } else {
        if (rightClass || leftClass) {
            size = clamp(sizeOptions.value, 0, width) / width;
        }
        if (topClass || bottomClass) {
            size = clamp(sizeOptions.value, 0, height) / height;
        }
    }

    return {
        isSmallX,
        isSmallY,
        isLeft,
        isRight,
        isTop,
        isBottom,
        rightClass,
        leftClass,
        topClass,
        bottomClass,
        size,
    };
}

export function renderInPlaceOverlay(
    overlay: HTMLElement,
    quadrant: Position,
    width: number,
    height: number,
    overlayModel?: DroptargetOverlayModel
): void {
    const shape = computeOverlayShape(quadrant, width, height, overlayModel);
    const { rightClass, leftClass, topClass, bottomClass, size } = shape;

    const box = { top: '0px', left: '0px', width: '100%', height: '100%' };

    if (rightClass) {
        box.left = `${100 * (1 - size)}%`;
        box.width = `${100 * size}%`;
    } else if (leftClass) {
        box.width = `${100 * size}%`;
    } else if (topClass) {
        box.height = `${100 * size}%`;
    } else if (bottomClass) {
        box.top = `${100 * (1 - size)}%`;
        box.height = `${100 * size}%`;
    }

    if (shape.isSmallX && shape.isLeft) {
        box.width = '4px';
    }
    if (shape.isSmallX && shape.isRight) {
        box.left = `${width - 4}px`;
        box.width = '4px';
    }
    if (shape.isSmallY && shape.isTop) {
        box.height = '4px';
    }
    if (shape.isSmallY && shape.isBottom) {
        box.top = `${height - 4}px`;
        box.height = '4px';
    }

    overlay.style.top = box.top;
    overlay.style.left = box.left;
    overlay.style.width = box.width;
    overlay.style.height = box.height;
    overlay.style.visibility = 'visible';
    if (!overlay.style.transform || overlay.style.transform === '') {
        overlay.style.transform = 'translate3d(0, 0, 0)';
    }

    const isLine =
        (shape.isSmallX && (shape.isLeft || shape.isRight)) ||
        (shape.isSmallY && (shape.isTop || shape.isBottom));

    toggleClass(overlay, 'dv-drop-target-small-vertical', shape.isSmallY);
    toggleClass(overlay, 'dv-drop-target-small-horizontal', shape.isSmallX);
    toggleClass(overlay, 'dv-drop-target-selection-line', isLine);
    toggleClass(overlay, 'dv-drop-target-left', shape.isLeft);
    toggleClass(overlay, 'dv-drop-target-right', shape.isRight);
    toggleClass(overlay, 'dv-drop-target-top', shape.isTop);
    toggleClass(overlay, 'dv-drop-target-bottom', shape.isBottom);
    toggleClass(overlay, 'dv-drop-target-center', quadrant === 'center');
}

interface AnchoredBounds {
    top: number;
    left: number;
    width: number;
    height: number;
}

function checkAnchoredBoundsChanged(
    overlay: HTMLElement,
    bounds: AnchoredBounds
): boolean {
    const topPx = `${Math.round(bounds.top)}px`;
    const leftPx = `${Math.round(bounds.left)}px`;
    const widthPx = `${Math.round(bounds.width)}px`;
    const heightPx = `${Math.round(bounds.height)}px`;
    return (
        overlay.style.top !== topPx ||
        overlay.style.left !== leftPx ||
        overlay.style.width !== widthPx ||
        overlay.style.height !== heightPx
    );
}

function applyAnchoredBounds(
    overlay: HTMLElement,
    bounds: AnchoredBounds
): void {
    overlay.style.top = `${Math.round(bounds.top)}px`;
    overlay.style.left = `${Math.round(bounds.left)}px`;
    overlay.style.width = `${Math.round(bounds.width)}px`;
    overlay.style.height = `${Math.round(bounds.height)}px`;
    overlay.style.visibility = 'visible';
    if (!overlay.style.transform || overlay.style.transform === '') {
        overlay.style.transform = 'translate3d(0, 0, 0)';
    }
}

/** `boundsChanged: false` lets callers skip redundant work on tight drag loops. */
export function renderAnchoredOverlay(args: {
    outlineElement: HTMLElement;
    targetModel: DropTargetTargetModel;
    quadrant: Position;
    width: number;
    height: number;
    overlayModel?: DroptargetOverlayModel;
    className?: string;
}): { boundsChanged: boolean; targetChanged: boolean } {
    const shape = computeOverlayShape(
        args.quadrant,
        args.width,
        args.height,
        args.overlayModel
    );
    const { rightClass, leftClass, topClass, bottomClass, size } = shape;

    const elBox = args.outlineElement.getBoundingClientRect();
    const ta = args.targetModel.getElements(undefined, args.outlineElement);
    const el = ta.root;
    const overlay = ta.overlay;
    const bigbox = el.getBoundingClientRect();
    const rootTop = elBox.top - bigbox.top;
    const rootLeft = elBox.left - bigbox.left;

    const box: AnchoredBounds = {
        top: rootTop,
        left: rootLeft,
        width: args.width,
        height: args.height,
    };

    if (rightClass) {
        box.left = rootLeft + args.width * (1 - size);
        box.width = args.width * size;
    } else if (leftClass) {
        box.width = args.width * size;
    } else if (topClass) {
        box.height = args.height * size;
    } else if (bottomClass) {
        box.top = rootTop + args.height * (1 - size);
        box.height = args.height * size;
    }

    if (shape.isSmallX && shape.isLeft) {
        box.width = 4;
    }
    if (shape.isSmallX && shape.isRight) {
        box.left = rootLeft + args.width - 4;
        box.width = 4;
    }
    if (shape.isSmallY && shape.isTop) {
        box.height = 4;
    }
    if (shape.isSmallY && shape.isBottom) {
        box.top = rootTop + args.height - 4;
        box.height = 4;
    }

    if (!checkAnchoredBoundsChanged(overlay, box)) {
        return { boundsChanged: false, targetChanged: ta.changed };
    }
    applyAnchoredBounds(overlay, box);

    overlay.className = `dv-drop-target-anchor${
        args.className ? ` ${args.className}` : ''
    }`;

    toggleClass(overlay, 'dv-drop-target-left', shape.isLeft);
    toggleClass(overlay, 'dv-drop-target-right', shape.isRight);
    toggleClass(overlay, 'dv-drop-target-top', shape.isTop);
    toggleClass(overlay, 'dv-drop-target-bottom', shape.isBottom);
    toggleClass(
        overlay,
        'dv-drop-target-anchor-line',
        (shape.isSmallX && (shape.isLeft || shape.isRight)) ||
            (shape.isSmallY && (shape.isTop || shape.isBottom))
    );
    toggleClass(overlay, 'dv-drop-target-center', args.quadrant === 'center');

    if (ta.changed) {
        toggleClass(overlay, 'dv-drop-target-anchor-container-changed', true);
        setTimeout(() => {
            toggleClass(
                overlay,
                'dv-drop-target-anchor-container-changed',
                false
            );
        }, 10);
    }

    return { boundsChanged: true, targetChanged: ta.changed };
}
