/**
 * Runs one of the read scripts here (`network`, `logs`, …) against the production database,
 * through an SSH tunnel that lives only as long as the script:
 *
 *   npm run prod -- network --venue havremagasinet --since 2h --minutes
 *   npm run prod -- logs --venue havremagasinet --unanswered --since 24h
 *
 * Everything that names the server is in server/.env.production.local (git-ignored), never in
 * this repo; see README → Reading production data. The database user there should be a
 * read-only one, so nothing run this way can change production.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(serverDir, '.env.production.local');
const REQUIRED = ['COUNCIL_PROD_SSH_HOST', 'COUNCIL_PROD_DB_URL', 'COUNCIL_PROD_DB_PREFIX'];
// The droplet's Mongo, as seen from the droplet itself.
const REMOTE_MONGO = '127.0.0.1:27017';

function fail(message) {
  console.error(`[prod] ${message}`);
  process.exit(1);
}

function portAnswers(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

const [script, ...scriptArgs] = process.argv.slice(2);
if (!script) fail('usage: npm run prod -- <script> [args…], e.g. npm run prod -- network --venue <id>');

if (!existsSync(envFile)) fail(`${envFile} is missing; see README → Reading production data.`);
const prodEnv = parseEnv(readFileSync(envFile, 'utf8'));
const missing = REQUIRED.filter((key) => !prodEnv[key]);
if (missing.length) fail(`${envFile} needs ${missing.join(', ')}.`);

let localPort;
try {
  const url = new URL(prodEnv.COUNCIL_PROD_DB_URL);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error();
  localPort = Number(url.port);
} catch {
  fail('COUNCIL_PROD_DB_URL must point at the tunnel: mongodb://<user>:<password>@127.0.0.1:<port>/…');
}
if (!localPort) fail('COUNCIL_PROD_DB_URL needs an explicit port (e.g. 27018, so it never meets a dev Mongo on 27017).');
if (await portAnswers(localPort)) {
  fail(`something already listens on 127.0.0.1:${localPort}; close it (an old tunnel?) or pick another port.`);
}

const tunnel = spawn(
  'ssh',
  ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${localPort}:${REMOTE_MONGO}`, prodEnv.COUNCIL_PROD_SSH_HOST],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);
let tunnelExited = false;
tunnel.once('exit', () => { tunnelExited = true; });
const closeTunnel = () => { if (!tunnelExited) tunnel.kill(); };
process.on('exit', closeTunnel);

const deadline = Date.now() + 20_000;
while (!(await portAnswers(localPort))) {
  if (tunnelExited) fail('the SSH tunnel closed before it was up (see ssh output above).');
  if (Date.now() > deadline) { closeTunnel(); fail('the SSH tunnel did not come up within 20 s.'); }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const child = spawn('npm', ['run', '--silent', script, '--', ...scriptArgs], {
  cwd: serverDir,
  stdio: 'inherit',
  // Set before config.ts loads .env, so these win over the dev database it names.
  env: { ...process.env, COUNCIL_DB_URL: prodEnv.COUNCIL_PROD_DB_URL, COUNCIL_DB_PREFIX: prodEnv.COUNCIL_PROD_DB_PREFIX },
});
// Ctrl-C reaches the script through the terminal; wait for it to finish, then close the tunnel.
process.on('SIGINT', () => {});
child.once('exit', (code, signal) => {
  closeTunnel();
  process.exit(code ?? (signal ? 1 : 0));
});
