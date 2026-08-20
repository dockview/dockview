import React from 'react';
import ReactDOMClient from 'react-dom/client';
import 'dockview/dist/styles/dockview.css';

import App from './app.tsx';

const rootElement = document.getElementById('app');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(<App theme={(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'} />);
}
