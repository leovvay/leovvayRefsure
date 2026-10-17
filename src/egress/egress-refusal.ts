export interface EgressRefusal {
  cause: 'not_set_up' | 'origin_denied' | 'oversize' | 'spend_limit';
  detail: string;
  /** The per-minute cap only: how long until enough of the calls in its window have left it for this one. */
  retryInMs?: number;
}
