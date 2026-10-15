/** `dismiss [--propose] [--agree] [--depth 1..3]`. */
export interface DismissArgs {
  /** Never click: answer `proposed` with a read ticket. */
  propose: boolean;
  /** Both providers must pick the same control (needs both set up); the default when both are. */
  agree: boolean;
  /** Overlays to dismiss in turn, for nested ones; at most 3. */
  depth: number;
}
