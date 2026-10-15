import { isRecord } from '../../shared';

/** The session names `session list` answers with (`{sessions: ["default", ...]}`); none when the shape is off. */
export function readSessions(result: unknown): string[] {
  const sessions = isRecord(result) ? result.sessions : null;
  return Array.isArray(sessions) ? sessions.filter((name): name is string => typeof name === 'string') : [];
}
