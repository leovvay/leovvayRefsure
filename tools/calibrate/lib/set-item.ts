/** One labelled item as the frozen benchmark sets store it (only the fields conversion reads). */
export interface SetItem {
  id: string;
  base?: string;
  task: string;
  lang?: string;
  source?: string;
  condition?: string;
  gold: number | string;
  alt?: (number | string)[];
  request: Record<string, unknown>;
}
