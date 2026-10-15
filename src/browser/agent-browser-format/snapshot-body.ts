import { isRecord } from '../is-record';
import type { SnapshotBody } from './snapshot-body-shape';

type RefEntries = Map<string, { role: string | null; name: string | null }>;

/**
 * Orca's `{result:{origin, refs, snapshot}}`, the bare result, agent-browser's own `{data:{snapshot, refs}}`, or
 * the snapshot text itself. Null when no snapshot text is found.
 */
export function snapshotBody(json: unknown): SnapshotBody | null {
  if (typeof json === 'string') return { text: json, origin: '', refs: null };
  if (!isRecord(json)) return null;
  for (const holder of [json.result, json.data, json]) {
    if (isRecord(holder) && typeof holder.snapshot === 'string') {
      const origin = typeof holder.origin === 'string' ? holder.origin : '';
      return { text: holder.snapshot, origin, refs: refEntriesOf(holder.refs) };
    }
  }
  return null;
}

function refEntriesOf(refs: unknown): RefEntries | null {
  if (!isRecord(refs)) return null;
  const out: RefEntries = new Map();
  for (const [ref, entry] of Object.entries(refs)) {
    const role = isRecord(entry) && typeof entry.role === 'string' ? entry.role : null;
    const name = isRecord(entry) && typeof entry.name === 'string' ? entry.name : null;
    out.set(ref, { role, name });
  }
  return out;
}
