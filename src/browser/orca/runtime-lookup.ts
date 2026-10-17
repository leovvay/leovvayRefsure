import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isRecord } from '../../shared';
import type { OrcaTransportChoice } from './orca-transport-choice';

const METADATA_FILE = 'orca-runtime.json';
const SOCKET_KINDS: ReadonlySet<string> = new Set(['unix', 'named-pipe']);
// Each sends the CLI somewhere this socket is not: a paired server over a websocket, or a bridged SSH session that
// presents its own scoped credential instead of the owner token.
const ROUTED_ELSEWHERE = ['ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING', 'ORCA_ENVIRONMENT', 'ORCA_SSH_BRIDGE_CREDENTIAL'];

/**
 * The user-data folder the `orca` CLI reads its runtime metadata from: `$ORCA_USER_DATA_PATH`, else the packaged
 * app's default for this platform. Null on Windows without `APPDATA`, where the CLI cannot resolve it either.
 */
export function orcaUserDataPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string | null {
  if (env.ORCA_USER_DATA_PATH) return env.ORCA_USER_DATA_PATH;
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'orca');
  if (platform === 'win32') return env.APPDATA ? join(env.APPDATA, 'orca') : null;
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'orca');
}

/**
 * Spec 2026-10-17 §2.3: the runtime socket when the metadata names one, else the CLI. Read on every call, as the
 * CLI does, so an Orca restarted mid-run is found at its new socket. Never throws; `why` never holds the token.
 */
export function chooseOrcaTransport(env: NodeJS.ProcessEnv): OrcaTransportChoice {
  if (env.REFSURE_ORCA_TRANSPORT === 'cli') return { kind: 'cli', why: 'REFSURE_ORCA_TRANSPORT=cli' };
  const routed = ROUTED_ELSEWHERE.find((name) => Boolean(env[name]));
  if (routed) return { kind: 'cli', why: `${routed} is set, so the orca CLI routes the call itself` };
  const dir = orcaUserDataPath(env);
  if (dir === null) return { kind: 'cli', why: 'APPDATA is not set, so the runtime metadata cannot be found' };
  const file = join(dir, METADATA_FILE);
  let metadata: unknown;
  try {
    metadata = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { kind: 'cli', why: `no readable runtime metadata at ${file}` };
  }
  const socketPath = socketOf(metadata);
  if (!isRecord(metadata) || socketPath === null) return { kind: 'cli', why: `no unix transport in ${file}` };
  const { authToken, runtimeId } = metadata;
  if (typeof authToken !== 'string' || authToken === '') return { kind: 'cli', why: `no runtime token in ${file}` };
  return {
    kind: 'socket',
    endpoint: { socketPath, authToken, runtimeId: typeof runtimeId === 'string' ? runtimeId : null },
  };
}

// The `transports` array, or the single `transport` older Orca versions wrote; the first unix or named-pipe entry.
function socketOf(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const list = Array.isArray(metadata.transports) ? metadata.transports : [metadata.transport];
  const found = list.find((entry) => isRecord(entry) && typeof entry.kind === 'string' && SOCKET_KINDS.has(entry.kind));
  return isRecord(found) && typeof found.endpoint === 'string' && found.endpoint !== '' ? found.endpoint : null;
}
