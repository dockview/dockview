import React from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';

const ThemeBuilderPage: React.FC = () => (
    <Layout
        title="Theme builder"
        description="Build a dockview theme with a live preview and export it as CSS and a theme object."
        noFooter
    >
        <BrowserOnly>
            {() => {
                const {
                    ThemeBuilder,
                } = require('../components/themeBuilder/ThemeBuilder');
                const theme =
                    new URLSearchParams(window.location.search).get('theme') ??
                    undefined;
                return <ThemeBuilder initialTheme={theme} />;
            }}
        </BrowserOnly>
    </Layout>
);

export default ThemeBuilderPage;
