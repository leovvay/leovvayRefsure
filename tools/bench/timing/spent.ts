import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderId } from '../../../src/questions';
import type { ArmsFile } from '../lib/arms';
import { GUARD_USD_PER_CALL } from '../lib/guards';
import { readRows } from '../lib/ledger';

/*
  7.3 priced sums for a timing runner's guards: every gateway call already in the results dir, priced at the 3x
  guard values (quality rows count their outer attempts, M2 rows their parts), in all and per phase; OpenRouter
  `usage.cost` per direct arm. M2 rows live under `m2_<combo>` and every part of one went through the gateway.
*/

interface AnyRow {
  slice?: string;
  arm?: string;
  usd?: number | null;
  attempts?: unknown[];
  parts?: { provider: ProviderId; usd: number | null }[];
}

export interface SpentSoFar { priced: number; byPhase: Map<string, number>; direct: Map<string, number> }

export function spentSoFar(out: string, arms: ArmsFile, phases: readonly string[] = ['P4', 'P5', 'P5b', 'P6']): SpentSoFar {
  let priced = 0;
  const byPhase = new Map<string, number>();
  const direct = new Map<string, number>();
  const add = (phase: string, usd: number) => {
    priced += usd;
    byPhase.set(phase, (byPhase.get(phase) ?? 0) + usd);
  };
  for (const phase of phases) {
    const phaseDir = join(out, phase);
    if (!existsSync(phaseDir)) continue;
    for (const armDir of readdirSync(phaseDir, { withFileTypes: true })) {
      if (!armDir.isDirectory() || armDir.name.startsWith('.') || armDir.name === 'state') continue;
      const arm = arms.arms.find((candidate) => candidate.id === armDir.name);
      for (const name of readdirSync(join(phaseDir, armDir.name)).filter((file) => /\.jsonl(\.gz)?$/.test(file))) {
        for (const row of readRows<AnyRow>(join(phaseDir, armDir.name, name))) {
          const at = `${phase}/${row.slice ?? 'final'}`;
          if (Array.isArray(row.parts)) {
            add(at, row.parts.reduce((sum, part) => sum + GUARD_USD_PER_CALL[part.provider], 0));
          } else if (arm?.via === 'gateway') {
            add(at, (row.attempts?.length ?? 0) * GUARD_USD_PER_CALL[arm.provider]);
          } else if (arm?.via === 'direct') {
            direct.set(arm.id, (direct.get(arm.id) ?? 0) + (row.usd ?? 0));
          }
        }
      }
    }
  }
  return { priced, byPhase, direct };
}
