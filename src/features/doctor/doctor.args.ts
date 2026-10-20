import type { PageHint } from '../../browser';

/**
 * `doctor [--ping]`: `ping` also asks each configured provider one synthetic Decision. `page`: the global `--page`,
 * the only agent-browser session the probe asks about.
 */
export interface DoctorArgs { ping: boolean; page: PageHint }
