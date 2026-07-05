import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const IMAGE = 'nonhumannonsense/council-of-foods';

export const FLAVORS = {
  latest: { tag: 'latest', dockerfile: 'Dockerfile' },
  test: { tag: 'test', dockerfile: 'Dockerfile' },
  proto: { tag: 'proto', dockerfile: 'prototype/Dockerfile' },
  asilomar: { tag: 'asilomar', dockerfile: 'Dockerfile' },
  logiqs: { tag: 'logiqs', dockerfile: 'Dockerfile' },
};

export function resolveFlavor(arg) {
  const flavor = arg ?? 'latest';
  if (!FLAVORS[flavor]) {
    console.error(`Unknown flavor "${flavor}". Valid flavors: ${Object.keys(FLAVORS).join(', ')}`);
    process.exit(1);
  }
  return flavor;
}

export function imageRef(flavor) {
  const { tag } = FLAVORS[resolveFlavor(flavor)];
  return `${IMAGE}:${tag}`;
}

/** Production images target linux/amd64; cross-build when the host is arm64 (e.g. Apple Silicon). */
export function dockerBuildArgs(tag, dockerfile) {
  const args = ['build', '.', '-t', `${IMAGE}:${tag}`, '-f', dockerfile];
  if (process.arch === 'arm64') {
    args.push('--platform', 'linux/amd64');
  }
  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { tag, dockerfile } = FLAVORS[resolveFlavor(process.argv[2])];
  const buildArgs = dockerBuildArgs(tag, dockerfile);

  if (process.arch === 'arm64') {
    console.log('Host is arm64 — building for linux/amd64');
  }

  const result = spawnSync('docker', buildArgs, { cwd: repoRoot, stdio: 'inherit' });

  process.exit(result.status ?? 1);
}
