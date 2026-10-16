import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { PageServer } from '../../calibrate/lib/page-server-shape';

/*
  The capture's page server: tools/calibrate's mount server (a page is served only at the path it is mounted on,
  so a set page shows at its recorded `at`, query kept by the caller), on a fixed port. A fixed origin keeps the
  `url:` lines and the request digests of every capture run equal, and lets the parity runs of refsure's own CLI
  pass the cfgs' `allowOrigins` (6.3: `http://127.0.0.1:8767`, the fixture server's origin). Never run it while
  the fixture server (P7) holds that port.
*/

const TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png',
};

export async function startMountServer(port: number): Promise<PageServer> {
  const mounts = new Map<string, string>();
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const file = mounts.get(path);
    let body: Buffer | null = null;
    try {
      body = file === undefined ? null : readFileSync(file);
    } catch {
      body = null;
    }
    if (file === undefined || body === null) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    const type = TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const origin = `http://127.0.0.1:${port}`;
  const key = (path: string): string => (path.startsWith('/') ? path : `/${path}`);
  return {
    origin,
    mount(path, file) {
      mounts.set(key(path), file);
      return `${origin}${key(path)}`;
    },
    unmount(path) {
      mounts.delete(key(path));
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
