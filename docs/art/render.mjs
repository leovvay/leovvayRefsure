// Renders docs/art/src/*.html to docs/art/*.png with headless Chrome, so the README art can be rebuilt.
// Usage: node docs/art/render.mjs [name ...]   (CHROME=/path/to/chrome overrides the binary)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// name -> [CSS width, CSS height, scale]: README images come out 2000 px wide (sharp at GitHub's ~980 px column on a
// 2x screen), the social card at GitHub's 1280 x 640.
const ART = {
  hero: [1600, 880, 1.25],
  'how-it-works': [1600, 832, 1.25],
  'hidden-tab': [1600, 688, 1.25],
  social: [1280, 640, 1],
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ART);
for (const name of names) {
  const size = ART[name];
  if (!size) throw new Error(`unknown art: ${name}`);
  const profile = mkdtempSync(join(tmpdir(), 'refsure-art-'));
  try {
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, `--force-device-scale-factor=${size[2]}`, `--window-size=${size[0]},${size[1]}`,
      '--virtual-time-budget=10000', `--screenshot=${join(here, `${name}.png`)}`,
      pathToFileURL(join(here, 'src', `${name}.html`)).href,
    ], { stdio: 'ignore', timeout: 60_000 });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  // With ffmpeg on PATH, a 256-colour palette halves the file; the art has few colours and looks the same.
  const out = join(here, `${name}.png`);
  const quantized = join(here, `${name}.q.png`);
  const q = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', out, '-vf',
    'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a',
    '-pix_fmt', 'pal8', quantized], { stdio: 'ignore' });
  if (q.status === 0) renameSync(quantized, out);
  else rmSync(quantized, { force: true });
  console.log(`${name}.png ${size[0] * size[2]}x${size[1] * size[2]}`);
}
