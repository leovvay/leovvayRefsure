import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const loader = { '.md': 'text' };
const SKILL = 'skills/refsure/SKILL.md';
const SKILL_MAX_LINES = 150;  // spec §10

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

try {
  await checkBundledSkill();
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
  define: { __REFSURE_VERSION__: JSON.stringify(pkg.version) },
  loader,
  legalComments: 'none',
  logLevel: 'warning',
});
