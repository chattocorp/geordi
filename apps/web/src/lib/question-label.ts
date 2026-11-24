/** Providers may append this marker to the option value they expect back. */
export const questionLabel = (value: string) => value.replace(/\s*\(recommended\)\s*$/i, '');
