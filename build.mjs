import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build, transform } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const loader = { '.md': 'text' };
const SKILL = 'skills/refsure/SKILL.md';
const SKILL_MAX_LINES = 150;  // spec §10
const TRAIL_PAGE = 'src/trail/page/trail-page.js';
// Spec trail v1: the page script is sent whole with every draw (an 8 KB eval answered in p50 0.49 ms).
const TRAIL_PAGE_MAX_BYTES = 16 * 1024;
// What the page script never does: write markup or inline style, run strings as code, log, reach the network or
// page storage, message other frames, wait on a frame or a promise (Orca awaits an eval in the tab's queue with no
// deadline), read a value, take focus, or stop the page's own events. `async(` is the minified form of `async (`.
const TRAIL_FORBIDDEN = [
  'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'Function(', "setAttribute('style'",
  'setAttribute("style"', 'console.', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'cookie',
  'postMessage', 'requestAnimationFrame', '.value', 'focus(', 'preventDefault', 'stopPropagation', 'Promise',
  'async ', 'async(', 'await ', 'url(',
];

/**
 * The troubleshooting table's rows under `## 9. Troubleshooting`, by cause: each backticked name in a row's first
 * cell, with the `(status, exit)` or `(exit)` that ends the cell. The header and separator rows come first.
 */
function troubleshootingRows(skill) {
  const start = skill.indexOf('\n## 9. Troubleshooting');
  if (start < 0) throw new Error(`${SKILL}: no "## 9. Troubleshooting" section`);
  const rest = skill.slice(start + 1);
  const end = rest.indexOf('\n## ');
  const lines = (end < 0 ? rest : rest.slice(0, end)).split('\n').filter((line) => line.startsWith('|')).slice(2);
  const rows = new Map();
  for (const line of lines) {
    const cell = line.split('|')[1].trim();
    const names = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const group = /\((?:([a-z_]+), )?(\d+)\)$/.exec(cell);
    if (names.length === 0 || group === null) throw new Error(`${SKILL} troubleshooting row "${cell}": no cause or no (exit)`);
    for (const name of names) {
      if (rows.has(name)) throw new Error(`${SKILL} troubleshooting table: ${name} has two rows`);
      rows.set(name, { status: group[1] ?? null, exit: Number(group[2]) });
    }
  }
  return rows;
}

/**
 * The skill's cause table is written by hand (its fix column cannot come from `causes --json`), so the build holds
 * it to the same CAUSES and exitFor the binary uses: `skill print` promises the copy that matches this binary.
 */
function checkTroubleshooting(skill, causes, exitFor) {
  const rows = troubleshootingRows(skill);
  const known = new Map(causes.map((row) => [row.cause, row]));
  const missing = causes.filter((row) => !rows.has(row.cause)).map((row) => row.cause);
  const unknown = [...rows.keys()].filter((name) => !known.has(name));
  const wrong = [];
  for (const [name, said] of rows) {
    const row = known.get(name);
    if (row === undefined) continue;
    const exit = exitFor(row.status);
    if (said.exit !== exit || (said.status !== null && said.status !== row.status)) {
      wrong.push(`${name} (says ${said.status === null ? '' : `${said.status}, `}${said.exit}; is ${row.status}, ${exit})`);
    }
  }
  const problems = [
    missing.length > 0 ? `missing ${missing.join(', ')}` : '',
    unknown.length > 0 ? `unknown ${unknown.join(', ')}` : '',
    wrong.length > 0 ? `wrong exit ${wrong.join(', ')}` : '',
  ].filter(Boolean);
  if (problems.length > 0) throw new Error(`${SKILL} troubleshooting table: ${problems.join('; ')}`);
}

/**
 * The bundled SKILL.md must name the major this binary speaks, or the binary's own `doctor` calls the copy it
 * prints stale. Read both through the real parser, so the check and `doctor` cannot disagree. It must also fit
 * in its line budget and list every cause with the exit this binary gives it.
 */
async function checkBundledSkill() {
  const probe = await build({
    stdin: {
      contents: [
        "export { BUNDLED_SKILL, SKILL_MAJOR, readSkillMajor } from './src/features/skill';",
        "export { CAUSES, exitFor } from './src/output';",
      ].join('\n'),
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    loader,
    logLevel: 'warning',
  });
  const code = Buffer.from(probe.outputFiles[0].text).toString('base64');
  const { BUNDLED_SKILL, SKILL_MAJOR, readSkillMajor, CAUSES, exitFor } = await import(`data:text/javascript;base64,${code}`);
  const read = readSkillMajor(BUNDLED_SKILL);
  if (read.major !== SKILL_MAJOR) {
    const found = read.major === null ? read.problem : `refsure-skill ${read.major}`;
    throw new Error(`${SKILL}: ${found}, but this binary speaks ${SKILL_MAJOR}; bump them together`);
  }
  const lines = BUNDLED_SKILL.split('\n').length - (BUNDLED_SKILL.endsWith('\n') ? 1 : 0);
  if (lines > SKILL_MAX_LINES) throw new Error(`${SKILL}: ${lines} lines, over its budget of ${SKILL_MAX_LINES}`);
  checkTroubleshooting(BUNDLED_SKILL, CAUSES, exitFor);
}

/**
 * The trail's page script, minified (`transform`) into one parenthesized function expression, the value of
 * `__TRAIL_PAGE__`. The file must hold that one expression and nothing else; it is assigned to a name so the minifier
 * keeps it, evaluated once in an empty context to take the function's own text (its body never runs), and refused on
 * a parse error, on any other statement, over `TRAIL_PAGE_MAX_BYTES`, or on a `TRAIL_FORBIDDEN` token. Tokens are
 * read in the minified text, so a comment may name them.
 */
async function trailPage() {
  let source;
  try {
    source = readFileSync(new URL(`./${TRAIL_PAGE}`, import.meta.url), 'utf8');
  } catch {
    throw new Error(`${TRAIL_PAGE}: the trail's page script cannot be read`);
  }
  const holder = '__refsureTrailPage';
  const { code } = await transform(`var ${holder} = ${source}`, {
    loader: 'js', minify: true, target: 'es2022', legalComments: 'none', sourcefile: TRAIL_PAGE, logLevel: 'silent',
  });
  let fn;
  try {
    fn = runInNewContext(`${code};${holder}`, Object.create(null), { timeout: 100 });
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new Error(`${TRAIL_PAGE}: does not evaluate to a function (${why})`);
  }
  if (typeof fn !== 'function') throw new Error(`${TRAIL_PAGE}: is not a function expression`);
  const text = Function.prototype.toString.call(fn);
  if (code !== `var ${holder}=(${text});\n` && code !== `var ${holder}=${text};\n`) {
    throw new Error(`${TRAIL_PAGE}: must hold one function expression and nothing else`);
  }
  const page = `(${text})`;
  const bytes = Buffer.byteLength(page);
  if (bytes > TRAIL_PAGE_MAX_BYTES) {
    throw new Error(`${TRAIL_PAGE}: ${bytes} bytes minified, over its budget of ${TRAIL_PAGE_MAX_BYTES}`);
  }
  const found = TRAIL_FORBIDDEN.filter((token) => page.includes(token));
  if (found.length > 0) {
    throw new Error(`${TRAIL_PAGE}: forbidden ${found.map((token) => JSON.stringify(token)).join(', ')}`);
  }
  return page;
}

let trail;
try {
  await checkBundledSkill();
  trail = await trailPage();
} catch (error) {
  console.error(`build refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/refsure.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  define: { __REFSURE_VERSION__: JSON.stringify(pkg.version), __TRAIL_PAGE__: JSON.stringify(trail) },
  loader,
  legalComments: 'none',
  logLevel: 'warning',
});
