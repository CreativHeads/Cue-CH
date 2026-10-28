// Start or stop the local PostgreSQL used on this PC (data in ../pgdata, port 5433).
// Usage: npm run db:local -- start   |   npm run db:local -- stop   |   npm run db:local -- status
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const bin = path.join(process.cwd(), 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe');
const data = path.resolve(process.cwd(), '..', 'pgdata');
const cmd = process.argv[2] ?? 'status';
const args: Record<string, string[]> = {
  start: ['-D', data, '-l', path.join(data, 'server.log'), '-o', '-p 5433', '-w', 'start'],
  stop: ['-D', data, '-m', 'fast', 'stop'],
  status: ['-D', data, 'status'],
};
if (!args[cmd]) { console.error('Use start, stop or status'); process.exit(1); }
// pg_ctl launches the server in the background; ignoring stdio stops it holding this terminal open
const r = spawnSync(bin, args[cmd], { stdio: cmd === 'start' ? 'ignore' : 'inherit', windowsHide: true });
if (cmd === 'start') console.log(r.status === 0 ? 'Local database running on port 5433.' : 'Could not start the database (is it already running?).');
process.exit(r.status ?? 1);
