import { spawnSync } from 'node:child_process';
import { imageRef, resolveFlavor } from './docker.mjs';

const result = spawnSync('docker', ['push', imageRef(resolveFlavor(process.argv[2]))], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
