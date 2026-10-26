import React from 'react';
// Import the original mapper
import MDXComponents from '@theme-original/MDXComponents';
import { FrameworkSpecific } from '@site/src/components/frameworkSpecific';
import { CodeRunner } from '../components/ui/codeRunner';
import {
    BlogFeedback,
    BlogReaction,
} from '../components/ui/feedback/blogFeedback';

export default {
    // Re-use the default mapping
    ...MDXComponents,
    // Map the "<Highlight>" tag to our Highlight component
    // `Highlight` will receive all props that were passed to `<Highlight>` in MDX
    FrameworkSpecific,
    CodeRunner,
    BlogFeedback,
    BlogReaction,
};
