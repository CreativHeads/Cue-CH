import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { row, rows, type Db } from './db';
import type { Staff } from './types';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = 'ch_session';
export const SESSION_DAYS = 30;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha = (token: string) => createHash('sha256').update(token).digest('hex');

/** Create a session; only the token's hash is stored. */
export async function createSession(staffId: string, on?: Db) {
  const token = randomBytes(32).toString('base64url');
  await rows(`insert into sessions (staff_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [staffId, sha(token), SESSION_DAYS], on);
  return token;
}

export async function staffForToken(token: string | undefined, on?: Db): Promise<Staff | null> {
  if (!token) return null;
  return row<Staff>(
    `select s.id, s.name, s.email, s.role, s.title, s.telegram_chat_id, s.digest_time, s.is_active
       from sessions x join staff s on s.id = x.staff_id
      where x.token_hash = $1 and x.expires_at > now() and s.is_active`, [sha(token)], on);
}

export async function deleteSession(token: string | undefined, on?: Db) {
  if (token) await rows(`delete from sessions where token_hash = $1`, [sha(token)], on);
}

// Simple in-memory brute-force guard: 8 failed attempts per email+IP per 15 minutes.
const attempts = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string) {
  const a = attempts.get(key);
  return !!a && a.n >= 8 && a.until > Date.now();
}
export function loginFailed(key: string) {
  const a = attempts.get(key);
  const fresh = !a || a.until < Date.now();
  attempts.set(key, { n: fresh ? 1 : a!.n + 1, until: fresh ? Date.now() + 15 * 60e3 : a!.until });
}
export const loginSucceeded = (key: string) => attempts.delete(key);
