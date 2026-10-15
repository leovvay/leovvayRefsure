/** One failed request: status ≥400, or 0 when no response came. `url` has no query and is redacted. */
export interface TriageRequest { method: string; url: string; status: number }
