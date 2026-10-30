for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* optional */ }
}
import { db, rows } from '../src/lib/db';
import { runGeneration } from '../src/lib/plans';

async function main() {
  const activePlans = await rows<{ id: string; client_name: string; month: string }>(
    `select p.id, c.name as client_name, p.month
     from plans p
     join clients c on c.id = p.client_id
     where p.status = 'active'`
  );
  console.log(`Found ${activePlans.length} active plans.`);
  for (const p of activePlans) {
    console.log(`Generating tasks for ${p.client_name} (${p.month})...`);
    const r = await runGeneration(db(), p.id, false);
    console.log(`Result for ${p.client_name}:`, r);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
