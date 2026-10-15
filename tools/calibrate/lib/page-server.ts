import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PageServer } from './page-server-shape';

const TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png',
};

/**
 * Serves stored pages on 127.0.0.1 at an ephemeral port. A page is served only at the path it was mounted on, so
 * the replay can show a stored page at the path it was recorded at (`/campaigns`); every other path is a 404.
 * Nothing outside the mounted files is ever read.
 */
export async function startPageServer(): Promise<PageServer> {
  const mounts = new Map<string, string>();
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const file = mounts.get(path);
    if (file === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    try {
      const body = readFileSync(file);
      const type = TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    mount(path, file) {
      const at = path.startsWith('/') ? path : `/${path}`;
      mounts.set(at, file);
      return `${origin}${at}`;
    },
    unmount(path) {
      mounts.delete(path.startsWith('/') ? path : `/${path}`);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
