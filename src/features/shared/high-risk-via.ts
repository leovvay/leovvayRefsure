import type { Ref } from '../../browser';

/** How `act-high-risk` reaches the element: a kept ticket, or a live ref with the name it shows. */
export type HighRiskVia = { ticket: string } | { ref: Ref; expectName: string };
