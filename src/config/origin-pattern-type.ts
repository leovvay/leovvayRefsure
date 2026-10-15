/**
 * One `allowOrigins` / `denyOrigins` entry: an exact origin (`https://example.com`) or a subdomain wildcard
 * (`https://*.example.com`, which does not match `example.com` itself). `port` is '' for the scheme's default.
 */
export interface OriginPattern { scheme: 'http:' | 'https:'; host: string; port: string; wildcard: boolean }
