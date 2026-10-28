import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time comparison of a provided secret with the expected one; false if either is empty. */
export function secretMatches(given: string | null | undefined, expected: string | undefined) {
  if (!given || !expected) return false;
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}
