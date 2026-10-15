/*
  A page-state item asked in several PII mask modes is one page with one id per mode (`<id>~masks-on`,
  `<id>~masks-off`). The fit counts pages, not modes: the modes of one page are the same evidence twice.
*/

const MODE = /~masks-(?:on|off)$/;

/** The id an item gets for one mask mode, when it is asked in several. */
export function modeId(id: string, masks: boolean): string {
  return `${id}~masks-${masks ? 'on' : 'off'}`;
}

/** The page an item id names, whatever mask mode it was asked in. */
export function pageOf(id: string): string {
  return id.replace(MODE, '');
}

/** One key per page across sets: two sets may reuse an id for different pages. */
export function pageKey(row: { id: string; set?: string }): string {
  return `${row.set ?? ''}\u0000${pageOf(row.id)}`;
}
