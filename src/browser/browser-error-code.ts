/**
 * `unsupported`: the backend cannot do this one thing (a value it cannot send, a check it cannot make); a retry will
 * not help. `backend_unknown`: `REFSURE_BACKEND` names no backend, so nothing was chosen; a human fixes the setting.
 */
export type BrowserErrorCode =
  | 'no_tab' | 'orca_not_running' | 'not_in_orca_terminal' | 'stale_ref' | 'timeout' | 'backend_error'
  | 'unsupported' | 'backend_unknown';
