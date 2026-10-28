// Apply db/migrations/*.sql in order (each once), and with --seed also run db/seed.sql.
// Usage: npm run db:migrate   |   npm run db:seed
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* optional */ }
}

const dir = path.join(process.cwd(), 'db');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (see .env.example)');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await client.query<{ name: string }>(`select name from schema_migrations`)).rows.map((r) => r.name));
    for (const file of readdirSync(path.join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(path.join(dir, 'migrations', file), 'utf8'));
        await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
        await client.query('commit');
        console.log(`applied ${file}`);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`${file}: ${(e as Error).message}`);
      }
    }
    if (process.argv.includes('--seed')) {
      await client.query(readFileSync(path.join(dir, 'seed.sql'), 'utf8'));
      console.log('seeded staff and clients');
    }
    console.log('database is up to date');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
