import { Pool, types } from 'pg';

// Return timestamps as ISO strings and dates as 'YYYY-MM-DD', matching what the UI expects.
types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
types.setTypeParser(1082, (v) => v); // date

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Driver extends Db {
  /** Run fn in one transaction with app.actor_id set, so audit triggers record who acted. */
  transaction<T>(actorId: string | null, fn: (db: Db) => Promise<T>): Promise<T>;
}

function pgDriver(): Driver {
  const g = globalThis as unknown as { __chPool?: Pool };
  const pool = (g.__chPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));
  return {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async transaction(actorId, fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('app.actor_id', $1, true)`, [actorId ?? '']);
        const out = await fn({ query: (t, p) => client.query(t, p as unknown[]) as never });
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

let driver: Driver | null = null;
/** Tests swap in an in-memory Postgres here. */
export function setDriver(d: Driver | null) { driver = d; }
export const db = (): Driver => (driver ??= pgDriver());

export async function rows<T>(text: string, params: unknown[] = [], on: Db = db()): Promise<T[]> {
  return (await on.query<T>(text, params)).rows;
}
export async function row<T>(text: string, params: unknown[] = [], on: Db = db()): Promise<T | null> {
  return (await on.query<T>(text, params)).rows[0] ?? null;
}

/** Build "a = $1, b = $2" from the allowed keys present in `patch`; returns the clause and params. */
export function setClause(patch: Record<string, unknown>, allowed: readonly string[], offset = 0) {
  const keys = allowed.filter((k) => patch[k] !== undefined);
  return {
    sql: keys.map((k, i) => `${k} = $${i + 1 + offset}`).join(', '),
    params: keys.map((k) => (patch[k] !== null && typeof patch[k] === 'object' && !Array.isArray(patch[k]) ? JSON.stringify(patch[k]) : patch[k])),
  };
}
