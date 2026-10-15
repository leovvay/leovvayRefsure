import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lower case, no padding. */
function base32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

const TICKET_RE = /^t_[a-z2-7]{26}$/;
const MARK_RE = /^m_[a-z2-7]{13}$/;

/** `t_` + 128 random bits (spec §8.7). */
export function newTicketId(): string {
  return `t_${base32(randomBytes(16))}`;
}

/** `m_` + 64 random bits (spec §8.7). */
export function newMarkId(): string {
  return `m_${base32(randomBytes(8))}`;
}

/** Lets `--ticket` refuse a malformed id as a usage error instead of `ticket_used`. */
export function isTicketId(id: string): boolean {
  return TICKET_RE.test(id);
}

export function isMarkId(id: string): boolean {
  return MARK_RE.test(id);
}
