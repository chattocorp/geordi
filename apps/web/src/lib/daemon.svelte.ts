/**
 * How many times this page has seen a daemon connect (the navigation view's `harnesses`
 * turning from `null`). What only a daemon can say, and none could when it was asked (a
 * repository's picture, while the app is still starting), is asked again then.
 */
export const daemon = $state({ connections: 0 });
