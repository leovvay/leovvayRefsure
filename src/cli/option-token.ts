/**
 * One option as the command line gave it, before `--`, in order: its long name and its value (`undefined` for a
 * boolean). A verb whose repeatable options run in the order given (`do`'s steps) reads these; `values` cannot
 * say how two different repeated options interleave.
 */
export interface OptionToken { name: string; value: string | undefined }
