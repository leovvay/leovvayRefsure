/**
 * Thrown by decide() and by the dry-run act stub. The registry turns it into
 * status `ok`, `acted:false`, `result: { dry_run: true, requests }`: a dry run never sends and never acts.
 */
export class DryRunStop extends Error {
  constructor() {
    super('dry run: nothing sent, nothing done');
    this.name = 'DryRunStop';
  }
}
