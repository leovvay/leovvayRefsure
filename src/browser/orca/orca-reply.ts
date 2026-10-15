/** One `orca … --json` answer: Orca prints `{ok, result}` or `{ok:false, error:{code, message}}` on stdout. */
export type OrcaReply =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string };
