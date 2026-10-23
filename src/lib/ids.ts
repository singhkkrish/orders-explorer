let counter = 0;
/** Small unique id for UI-only objects (filter groups/conditions). Not used for orders. */
export const uid = (prefix = 'x'): string => `${prefix}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
