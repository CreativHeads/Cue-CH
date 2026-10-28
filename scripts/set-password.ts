// Set a staff member's password from the server shell (e.g. the first admin login).
// Usage: npm run set-password -- souban@example.com 'a-strong-password'
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { Client } from 'pg';

for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* optional */ }
}

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error("Usage: npm run set-password -- <email> '<password>'");
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (see .env.example)');
  const salt = randomBytes(16);
  const hash = `scrypt$${salt.toString('base64')}$${(await scrypt(password, salt, 64)).toString('base64')}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const r = await client.query(`update staff set password_hash = $2 where lower(email) = lower($1) returning name`, [email, hash]);
    if (!r.rowCount) throw new Error(`No staff member with email ${email}. Add them to db/seed.sql or the staff table first.`);
    await client.query(`delete from sessions where staff_id = (select id from staff where lower(email) = lower($1))`, [email]);
    console.log(`Password set for ${r.rows[0].name}.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
