import type { PageHint, Ref } from '../../browser';

/** `guard --ref @eN` (on the resolved page) or `guard --ticket T` (on the ticket's page, without spending it). */
export type GuardArgs = { mode: 'ref'; ref: Ref; hint: PageHint } | { mode: 'ticket'; ticket: string; page: string | null };
