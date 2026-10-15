import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const loader = { '.md': 'text' };

/**
 * The bundled SKILL.md must name the major this binary speaks, or the binary's own `doctor` calls the copy it
 * prints stale. Read both through the real parser, so the check and `doctor` cannot disagree.
 */
async function checkBundledSkill() {
  const probe = await build({
    stdin: {
      contents: "export { BUNDLED_SKILL, SKILL_MAJOR, readSkillMajor } from './src/features/skill';",
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
  const { BUNDLED_SKILL, SKILL_MAJOR, readSkillMajor } = await import(`data:text/javascript;base64,${code}`);
  const read = readSkillMajor(BUNDLED_SKILL);
  if (read.major !== SKILL_MAJOR) {
    const found = read.major === null ? read.problem : `refsure-skill ${read.major}`;
    throw new Error(`skills/refsure/SKILL.md: ${found}, but this binary speaks ${SKILL_MAJOR}; bump them together`);
  }
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
