import { IDockviewHeaderActionsProps } from 'dockview-react';
import * as React from 'react';
import { nextId } from './defaultLayout';

const Icon = (props: {
    icon: string;
    title?: string;
    onClick?: (event: React.MouseEvent) => void;
}) => {
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onClick?.(e as unknown as React.MouseEvent);
        }
    };

    return (
        <button
            title={props.title}
            className="action"
            onClick={props.onClick}
            onKeyDown={onKeyDown}
            type="button"
            aria-label={props.title}
        >
            <span
                style={{ fontSize: 'inherit' }}
                className="material-symbols-outlined"
            >
                {props.icon}
            </span>
        </button>
    );
};

const groupControlsComponents: Record<string, React.FC> = {
    panel_1: () => {
        return <Icon icon="file_download" />;
    },
};

export const RightControls = (props: IDockviewHeaderActionsProps) => {
    if (props.location.type === 'edge') {
        return null;
    }

    const Component = React.useMemo(() => {
        if (!props.isGroupActive || !props.activePanel) {
            return null;
        }

        return groupControlsComponents[props.activePanel.id];
    }, [props.isGroupActive, props.activePanel]);

    const [isMaximized, setIsMaximized] = React.useState<boolean>(
        props.containerApi.hasMaximizedGroup()
    );

    const [isPopout, setIsPopout] = React.useState<boolean>(
        props.api.location.type === 'popout'
    );

    React.useEffect(() => {
        const disposable = props.containerApi.onDidMaximizedGroupChange(() => {
            setIsMaximized(props.containerApi.hasMaximizedGroup());
        });

        const disposable2 = props.api.onDidLocationChange(() => {
            setIsPopout(props.api.location.type === 'popout');
        });

        return () => {
            disposable.dispose();
            disposable2.dispose();
        };
    }, [props.containerApi]);

    const onClick = () => {
        if (props.containerApi.hasMaximizedGroup()) {
            props.containerApi.exitMaximizedGroup();
        } else {
            props.activePanel?.api.maximize();
        }
    };

    const onClick2 = () => {
        if (props.api.location.type !== 'popout') {
            props.containerApi.addPopoutGroup(props.group);
        } else {
            props.api.moveTo({ position: 'right' });
        }
    };

    const vertical =
        props.group.api.getHeaderPosition() === 'left' ||
        props.group.api.getHeaderPosition() === 'right';

    return (
        <div
            className="group-control"
            style={{
                display: 'flex',
                flexDirection: vertical ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0px 8px',
                height: '100%',
                color: 'var(--dv-activegroup-hiddenpanel-tab-color)',
            }}
        >
            {props.isGroupActive && <Icon icon="star" />}
            {Component && <Component />}
            <Icon
                title={isPopout ? 'Close Window' : 'Open In New Window'}
                icon={isPopout ? 'close_fullscreen' : 'open_in_new'}
                onClick={onClick2}
            />
            {!isPopout && (
                <Icon
                    title={isMaximized ? 'Minimize View' : 'Maximize View'}
                    icon={isMaximized ? 'collapse_content' : 'expand_content'}
                    onClick={onClick}
                />
            )}
        </div>
    );
};

export const LeftControls = (props: IDockviewHeaderActionsProps) => {
    if (props.location.type === 'edge') {
        return null;
    }

    const onClick = () => {
        props.containerApi.addPanel({
            id: `id_${Date.now().toString()}`,
            component: 'default',
            title: `Tab ${nextId()}`,
            position: {
                referenceGroup: props.group,
            },
        });
    };

    return (
        <div
            className="group-control"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0px 8px',
                height: '100%',
                color: 'var(--dv-activegroup-visiblepanel-tab-color)',
            }}
        >
            <Icon onClick={onClick} icon="add" />
        </div>
    );
};

export const PrefixHeaderControls = (props: IDockviewHeaderActionsProps) => {
    if (props.location.type === 'edge') {
        return null;
    }

    return (
        <div
            className="group-control"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0px 8px',
                height: '100%',
                color: 'var(--dv-activegroup-visiblepanel-tab-color)',
            }}
        >
            <Icon icon="Menu" />
        </div>
    );
};
