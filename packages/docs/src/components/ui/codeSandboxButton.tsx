import * as React from 'react';
import './codeSandboxButton.scss';
import { ThemePicker } from './container';

const BASE_SANDBOX_URL =
    'https://codesandbox.io/s/github/dockview/dockview/tree/master/packages/docs/sandboxes';

const createSvgElementFromPath = (params: {
    height: string;
    width: string;
    viewbox: string;
    path: string;
}) => {
    return (
        <svg
            height={params.height}
            width={params.width}
            viewBox={params.viewbox}
            focusable={false}
            className={'dv-svg'}
        >
            <path d={params.path} />
        </svg>
    );
};

const CloseButton = () =>
    createSvgElementFromPath({
        width: '16',
        height: '16',
        viewbox: '0 0 50 58',
        path: 'M22.5581 50.9938V30.1717L4.65116 19.869V31.7386L12.8536 36.4939V45.4198L22.5581 50.9938ZM27.2093 51.1162L37.0931 45.4226V36.2851L45.3488 31.501V19.7801L27.2093 30.2529V51.1162ZM42.9633 15.7867L33.4288 10.2615L25.0571 15.1193L16.6219 10.2567L7.00237 15.8557L24.9542 26.1842L42.9633 15.7867ZM0 43.4008V14.5498L24.9974 0L50 14.4887V43.3552L24.9969 57.7584L0 43.4008Z',
    });

export const CodeSandboxButton = (props: {
    id: string;
    hideThemePicker?: boolean;
}) => {
    const url = React.useMemo(() => {
        if (!props.id) {
            return '';
        }
        return `${BASE_SANDBOX_URL}/${props.id}`;
    }, [props.id]);

    return (
        <>
            {!props.hideThemePicker && <ThemePicker />}
            <span
                className="codesandbox-button"
                style={{ display: 'flex', alignItems: 'center' }}
            >
                <span className="codesandbox-button-pretext">{`Open in `}</span>
                <a
                    href={url}
                    target={'_blank'}
                    rel="noopener"
                    className="codesandbox-button-content"
                >
                    <span
                        style={{
                            fontWeight: 'bold',
                            paddingRight: '4px',
                        }}
                    >
                        CodeSandbox
                    </span>
                    <CloseButton />
                </a>
            </span>
        </>
    );
};
