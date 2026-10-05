import * as React from 'react';
import { convertMarkdown } from '../util/markdown';
import { cssVariableGroups } from '../config/cssVariable.config';
import { themeObjectProperties } from '../config/themeObject.config';

const Markdown = (props: { text: string }) => (
    <span dangerouslySetInnerHTML={{ __html: convertMarkdown(props.text) }} />
);

const slug = (title: string) =>
    title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

/** Every property of the theme object and its CSS equivalent. */
export const ThemeObjectReference = () => (
    <table>
        <thead>
            <tr>
                <th>Property</th>
                <th>Default</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            {themeObjectProperties.map((p) => (
                <tr key={p.name} id={`theme-${p.name}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                        <code>{p.name}</code>
                        <div style={{ fontSize: '0.8em', opacity: 0.75, marginTop: 4 }}>
                            {p.type}
                        </div>
                    </td>
                    <td>
                        <Markdown text={p.default} />
                    </td>
                    <td>
                        <Markdown text={p.text} />
                    </td>
                </tr>
            ))}
        </tbody>
    </table>
);

/** Every CSS variable a theme can set, grouped and searchable. */
export const CssVariableReference = () => {
    const [query, setQuery] = React.useState('');
    const q = query.trim().toLowerCase();
    const groups = cssVariableGroups
        .map((group) => ({
            ...group,
            variables: group.variables.filter(
                (v) =>
                    !q ||
                    v.key.toLowerCase().includes(q) ||
                    v.text.toLowerCase().includes(q) ||
                    group.title.toLowerCase().includes(q)
            ),
        }))
        .filter((group) => group.variables.length > 0);
    const total = cssVariableGroups.reduce(
        (sum, g) => sum + g.variables.length,
        0
    );
    const shown = groups.reduce((sum, g) => sum + g.variables.length, 0);

    return (
        <div>
            <input
                type="search"
                placeholder={`Search ${total} variables`}
                aria-label="Search CSS variables"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: 8,
                    font: 'inherit',
                    borderRadius: 8,
                    border: '1px solid var(--ifm-toc-border-color)',
                    background: 'var(--ifm-background-color)',
                    color: 'var(--ifm-font-color-base)',
                }}
            />
            <p style={{ fontSize: '0.85em', opacity: 0.75 }}>
                {q
                    ? `${shown} of ${total} variables match.`
                    : `${total} variables in ${cssVariableGroups.length} groups: ${cssVariableGroups
                          .map((g) => g.title)
                          .join(', ')}.`}
            </p>
            {groups.map((group) => (
                <section key={group.title}>
                    <h3 id={`css-${slug(group.title)}`}>{group.title}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Variable</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {group.variables.map((v) => (
                                <tr key={v.key}>
                                    <td>
                                        <code>{v.key}</code>
                                    </td>
                                    <td>
                                        <Markdown text={v.text} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            ))}
        </div>
    );
};
