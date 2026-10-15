/** A Markdown file imported as its text: esbuild's `text` loader embeds it at build time (build.mjs). */
declare module '*.md' {
  const text: string;
  export default text;
}
