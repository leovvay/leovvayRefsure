import type { CfgsFile } from '../e2e/cfgs';
import type { CfgId } from '../e2e/scenario';
import { commandFor } from '../e2e/cfgs';
import { runCommand } from '../e2e/command';
import type { ArmRuntime } from '../lib/ask';
import { prepare } from '../lib/ask';
import type { BenchItem } from '../lib/items';
import { defaultOrders } from '../lib/items';

/*
  The 3.5 parity checks run refsure's own built CLI (`--dry-run`: no request leaves, nothing is clicked) on the page
  the capture just read, under one cfg's XDG pair (6.3), and compare request bodies byte for byte with the body the
  bench builds for the captured item (lib/ask.ts `prepare`, order p0). Only the Jev request is compared: the other
  provider has no shipped route at outcome or option-map.
*/

export interface Cli { cfgs: CfgsFile; dist: string }
export interface Envelope { status?: string; why?: unknown; result?: Record<string, unknown> | null }

export async function runCli(cli: Cli, cfg: CfgId, argv: readonly string[]): Promise<{ env: Envelope | null; exit: number | null; stderr: string | null }> {
  const cmd = commandFor(cli.cfgs, cfg, 'orca', cli.dist, argv);
  const out = await runCommand(cmd.argv, cmd.env, 90_000);
  return { env: out.envelope as Envelope | null, exit: out.exit, stderr: out.stderr };
}

/** The Jev request body a `--dry-run` envelope printed, as JSON text; null when there is none. */
export function dryBody(env: Envelope | null): string | null {
  const requests = env?.result?.requests;
  if (!Array.isArray(requests)) return null;
  const jev = (requests as { provider?: string; body?: unknown }[]).find((r) => r.provider === 'jev');
  return jev?.body === undefined ? null : JSON.stringify(jev.body);
}

/** The body the bench sends for an item on one arm, as JSON text (`p0` order on candidate sites). */
export function benchBody(rt: ArmRuntime, item: BenchItem): string | null {
  const prepared = prepare(rt, item, defaultOrders(item)[0]!);
  return prepared.body === null ? null : JSON.stringify(prepared.body);
}

/** Why an envelope gave no body: its status and cause, scrubbed by the runner. */
export function noBodyWhy(run: { env: Envelope | null; exit: number | null; stderr: string | null }): string {
  return `exit ${run.exit} ${run.env?.status ?? 'no envelope'} ${JSON.stringify(run.env?.why ?? run.stderr ?? '').slice(0, 300)}`;
}

/** A field of a JSON body's `state` (outcome sides). */
export function stateField(body: string | null, key: string): string | null {
  if (body === null) return null;
  const state = (JSON.parse(body) as { state?: Record<string, unknown> }).state;
  return typeof state?.[key] === 'string' ? state[key] as string : null;
}
