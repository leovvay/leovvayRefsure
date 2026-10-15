/** `label` is the env name or `argv[0]`, never the value. A key lives in memory for one request. */
export interface KeySource { label: string; read(): Promise<string | null> }
