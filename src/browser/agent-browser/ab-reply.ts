/**
 * One `agent-browser --json …` answer: it prints `{success:true, data}` or `{success:false, error}` on stdout,
 * where `error` is a message (`Unknown ref: e7`), not a code.
 */
export type AbReply =
  | { ok: true; result: unknown }
  | { ok: false; message: string };
