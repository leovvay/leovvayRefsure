import type { ConfigErrorCause } from './config-error-cause';

/** Thrown by `loadConfig`. `cause_` because `Error.cause` already means something else. */
export class ConfigError extends Error {
  readonly cause_: ConfigErrorCause;
  readonly detail: string;

  constructor(cause: ConfigErrorCause, detail: string) {
    super(`${cause}: ${detail}`);
    this.name = 'ConfigError';
    this.cause_ = cause;
    this.detail = detail;
  }
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}
