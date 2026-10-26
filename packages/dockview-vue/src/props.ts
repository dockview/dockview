/**
 * Vue casts an absent Boolean prop to `false` unless it declares a default;
 * a default of `undefined` keeps omitted options at dockview-core's defaults.
 * Typed as `object` so the keys do not alter the public prop types.
 */
export function undefinedDefaults(keys: readonly string[]): object {
    return Object.fromEntries(keys.map((key) => [key, undefined]));
}
