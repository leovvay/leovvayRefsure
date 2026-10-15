export type KeySpec = { env: string } | { command: string[] };

/** A custom gateway gets no default paths, models or headers (spec §7.1). */
export interface GatewayConfig {
  url: string;
  jevPath?: string;
  jevModel?: string;
  openaiPath?: string;
  openaiModel?: string;
  headers?: Record<string, string>;
}

export interface RefsureConfig {
  keys: { openrouter: KeySpec | null; openai: KeySpec | null; gateway: KeySpec | null };
  gateway: GatewayConfig | null;
  allowOrigins: string[];
  denyOrigins: string[];
  piiMasks: boolean;
  requireIsolatedProfile: boolean;
  limits: { decisionsPerMinute: number; usdPerDay: number };
  paths: { config: string; consent: string; state: string; egressLog: string };
}
