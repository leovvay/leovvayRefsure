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
  /**
   * The parser named it from its own text (`nameClickables`): a node agent-browser found clickable by its cursor,
   * with no role of a control, no name and no control inside or around it (a calendar day).
   */
  textNamed?: true;
}

export interface AxTree {
  origin: string;
  pageId: string;
  nodes: readonly AxNode[];
  /** Lines the parser could not read. */
  dropped: number;
}
