declare const __REFSURE_VERSION__: string;

/** Injected by esbuild from package.json; `0.0.0-dev` when run unbundled. */
export const VERSION: string = typeof __REFSURE_VERSION__ === 'string' ? __REFSURE_VERSION__ : '0.0.0-dev';
