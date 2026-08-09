import React from 'react';
import { CloseButton, PinButton } from '../svg';
import { DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview';

function useTitle(api: DockviewPanelApi): string | undefined {
    const [title, setTitle] = React.useState<string | undefined>(api.title);

    React.useEffect(() => {
        const disposable = api.onDidTitleChange((event) => {
            setTitle(event.title);
        });

        // Depending on the order in which React effects are run, the title may already be out of sync (cf. issue #1003).
        if (title !== api.title) {
            setTitle(api.title);
        }

        return () => {
            disposable.dispose();
        };
    }, [api]);

    return title;
}

function useIsPinned(api: DockviewPanelApi): boolean {
    const [isPinned, setIsPinned] = React.useState<boolean>(api.isPinned);

    React.useEffect(() => {
        const disposable = api.onDidChangePinned((event) => {
            setIsPinned(event.isPinned);
        });

        // Guard against the pinned state changing before this effect ran (cf.
        // the title race in `useTitle`).
        if (isPinned !== api.isPinned) {
            setIsPinned(api.isPinned);
        }

        return () => {
            disposable.dispose();
        };
    }, [api]);

    return isPinned;
}

export type IDockviewDefaultTabProps = IDockviewPanelHeaderProps &
    React.HtmlHTMLAttributes<HTMLDivElement> & {
        hideClose?: boolean;
        closeActionOverride?: () => void;
    };

export const DockviewDefaultTab: React.FunctionComponent<
    IDockviewDefaultTabProps
> = ({
    api,
    containerApi: _containerApi,
    params: _params,
    hideClose,
    closeActionOverride,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    tabLocation,
    ...rest
}) => {
    const title = useTitle(api);
    const isPinned = useIsPinned(api);

    const isMiddleMouseButton = React.useRef<boolean>(false);

    const onClose = React.useCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();

            if (closeActionOverride) {
                closeActionOverride();
            } else {
                api.close();
            }
        },
        [api, closeActionOverride]
    );

    const onBtnPointerDown = React.useCallback((event: React.MouseEvent) => {
        event.preventDefault();
    }, []);

    const _onPointerDown = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            isMiddleMouseButton.current = event.button === 1;
            onPointerDown?.(event);
        },
        [onPointerDown]
    );

    const _onPointerUp = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (
                isMiddleMouseButton.current &&
                event.button === 1 &&
                !hideClose
            ) {
                isMiddleMouseButton.current = false;
                onClose(event);
            }

            onPointerUp?.(event);
        },
        [onPointerUp, onClose, hideClose]
    );

    const _onPointerLeave = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            isMiddleMouseButton.current = false;
            onPointerLeave?.(event);
        },
        [onPointerLeave]
    );

    return (
        <div
            data-testid="dockview-dv-default-tab"
            {...rest}
            onPointerDown={_onPointerDown}
            onPointerUp={_onPointerUp}
            onPointerLeave={_onPointerLeave}
            className="dv-default-tab"
        >
            {isPinned && (
                // Core injects a `.dv-tab-pin` indicator for vanilla tabs but
                // suppresses it for custom `tabComponent`s like this one, so
                // render it here.
                <div className="dv-tab-pin">
                    <PinButton />
                </div>
            )}
            <span className="dv-default-tab-content">{title}</span>
            {!hideClose && (
                <button
                    type="button"
                    className="dv-default-tab-action"
                    aria-label="Close tab"
                    onPointerDown={onBtnPointerDown}
                    onClick={onClose}
                >
                    <CloseButton />
                </button>
            )}
        </div>
    );
};
