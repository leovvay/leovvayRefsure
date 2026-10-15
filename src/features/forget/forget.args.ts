import type { PageHint } from '../../browser';

/** `forget [--all]`: this page's marks and tickets (the page from `--page`, `REFSURE_PAGE` or the current tab), or all. */
export type ForgetArgs = { all: true } | { all: false; hint: PageHint };
