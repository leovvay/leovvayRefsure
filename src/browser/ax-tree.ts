export type Ref = `e${number}`;

export interface AxNode {
  /** Index in snapshot-text order. */
  i: number;
  depth: number;
  role: string;
  /** Raw and unescaped; `norm` it before comparing. */
  name: string;
  ref: Ref | null;
  /** `level=1` → `'1'`; a bare `selected` → `true`; `ref` is moved to `ref`. */
  attrs: Readonly<Record<string, string | true>>;
  /** Text after `: ` on the line, e.g. a textbox's value. Never sent, never printed. */
  value: string | null;
  parent: number | null;
  children: number[];
}

export interface AxTree {
  origin: string;
  pageId: string;
  nodes: readonly AxNode[];
  /** Lines the parser could not read. */
  dropped: number;
}
