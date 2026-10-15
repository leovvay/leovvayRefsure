/**
 * Where a key comes from: an env variable (`label` is its name) or a command (`label` is `argv[0]`); never the value.
 * A key lives in memory for one request.
 */
export interface KeySource { kind: 'env' | 'command'; label: string; read(): Promise<string | null> }
