// Regenerates docs/test-inventory.md (see TESTING.md for the rubric it supports).
//
// Usage, from the repo root:
//   cd client && npx vitest run --coverage --reporter=json --outputFile=test-report.json && cd ..
//   cd server && npx vitest run --coverage --reporter=json --outputFile=test-report.json && cd ..
//   node docs/generate-test-inventory.mjs
//
// The vitest JSON reports are optional (the "ms" column is left blank without them);
// coverage-final.json in client/coverage and server/coverage is required for the gaps section.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHURN_SINCE = '6 months ago';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules' || e === 'playwright-report' || e === 'test-results') continue;
      walk(p, out);
    } else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(e)) out.push(p);
  }
  return out;
}

const testFiles = [...walk(join(ROOT, 'client/tests')), ...walk(join(ROOT, 'server/tests'))];

const churn = {};
const log = execSync(
  `git -C ${ROOT} log --since="${CHURN_SINCE}" --name-only --pretty=format: -- client/tests client/src server/tests server/src server/server.ts shared`,
  { maxBuffer: 64 * 1024 * 1024 }
).toString();
for (const line of log.split('\n')) {
  const f = line.trim();
  if (f) churn[f] = (churn[f] || 0) + 1;
}

const runtime = {};
for (const side of ['server', 'client']) {
  const reportPath = join(ROOT, side, 'test-report.json');
  if (!existsSync(reportPath)) continue;
  const d = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const r of d.testResults) {
    const rel = relative(ROOT, r.name);
    runtime[rel] = (runtime[rel] || 0) + (r.endTime - r.startTime);
  }
}

const rows = [];
const allTestNames = new Map();
for (const f of testFiles) {
  const rel = relative(ROOT, f);
  const src = readFileSync(f, 'utf8');
  const caseMatches = [...src.matchAll(/^\s*(?:it|test)(?:\.\w+)?\s*\(\s*(['"`])(.*?)\1/gm)];
  const cases = caseMatches.length;
  const asserts = (src.match(/expect\s*\(/g) || []).length;
  for (const m of caseMatches) {
    const name = m[2];
    if (!allTestNames.has(name)) allTestNames.set(name, []);
    allTestNames.get(name).push(rel);
  }
  rows.push({
    file: rel,
    lines: src.split('\n').length,
    cases,
    each: [...src.matchAll(/^\s*(?:it|test)\.each/gm)].length,
    assertsPerCase: cases ? +(asserts / cases).toFixed(1) : 0,
    churn: churn[rel] || 0,
    ms: runtime[rel] != null ? Math.round(runtime[rel]) : '',
  });
}
rows.sort((a, b) => b.lines - a.lines);
const dupes = [...allTestNames.entries()].filter(([, files]) => new Set(files).size > 1);

function covRows(side) {
  const covPath = join(ROOT, side, 'coverage/coverage-final.json');
  if (!existsSync(covPath)) return [];
  const cov = JSON.parse(readFileSync(covPath, 'utf8'));
  const out = [];
  for (const [file, data] of Object.entries(cov)) {
    const rel = relative(ROOT, file);
    if (rel.includes('tests/') || rel.includes('coverage/')) continue;
    const counts = Object.values(data.s);
    if (!counts.length) continue;
    const hit = counts.filter(c => c > 0).length;
    out.push({ file: rel, pct: Math.round((hit / counts.length) * 100), stmts: counts.length });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

const fmt = (r) => `| ${r.file} | ${r.cases}${r.each ? ` (+${r.each} each)` : ''} | ${r.lines} | ${r.ms} | ${r.assertsPerCase} | ${r.churn} |`;
const header = '| test file | cases | lines | ms | asserts/case | churn |\n|---|---|---|---|---|---|';
const clientRows = rows.filter(r => r.file.startsWith('client/'));
const serverRows = rows.filter(r => r.file.startsWith('server/'));
const covSection = (side) => {
  const gaps = covRows(side).filter(r => r.pct < 50);
  if (!gaps.length) return '_no coverage data or no gaps_';
  return `| source file | % stmts | stmts |\n|---|---|---|\n${gaps.map(r => `| ${r.file} | ${r.pct} | ${r.stmts} |`).join('\n')}`;
};

const md = `# Test-suite inventory (generated ${new Date().toISOString().slice(0, 10)})

Working document for the test-coverage review — see [TESTING.md](../TESTING.md) for the
rubric. Regenerate with \`node docs/generate-test-inventory.mjs\` (see the header of that
script) rather than hand-editing the tables; verdicts go in the review-slice section at the
bottom.

**Totals:** ${rows.length} test files, ~${rows.reduce((a, r) => a + r.cases, 0)} cases
(client ${clientRows.length} files / ${clientRows.reduce((a, r) => a + r.cases, 0)} cases, server ${serverRows.length} files / ${serverRows.reduce((a, r) => a + r.cases, 0)} cases).

Columns: **ms** = wall time for the file in the profiling run (blank if no report; Playwright
e2e specs always run outside vitest). **asserts/case** = expect() calls per test — very low
values can flag weak tests, very high values flag multi-behavior tests. **churn** = commits
touching the file in the last 6 months (high churn = high-maintenance).

## Review flags (mechanical, no judgment applied)

### Large files (>400 lines) — table-driven / consolidation candidates
${header}
${rows.filter(r => r.lines > 400).map(fmt).join('\n')}

### Slowest files (>2s)
${header}
${rows.filter(r => r.ms > 2000).sort((a, b) => b.ms - a.ms).map(fmt).join('\n') || '_none_'}

### Weak assertion density (<1.5 expect/case, excluding .each tables)
${header}
${rows.filter(r => r.assertsPerCase < 1.5 && r.cases > 3 && !r.each).sort((a, b) => a.assertsPerCase - b.assertsPerCase).map(fmt).join('\n')}

### Duplicate test names across files
${dupes.map(([n, f]) => `- \`${n}\` — ${[...new Set(f)].join(', ')}`).join('\n') || '_none_'}

## Coverage gaps (source files < 50% statements covered)

Low coverage is a *prompt to check for untested behaviors*, not a target (TESTING.md).
Entry points, dev tooling, and thin wrappers may be fine uncovered.

### Client
${covSection('client')}

### Server
${covSection('server')}

## Full inventory

### Client
${header}
${clientRows.map(fmt).join('\n')}

### Server
${header}
${serverRows.map(fmt).join('\n')}

## Review slices

Verdicts per slice (keep / merge / rewrite / delete), each reviewed in its own session
against TESTING.md, each producing one small PR:

- [ ] 1. Meeting lifecycle + resume/replay (server)
- [ ] 2. Audio pipeline (server)
- [ ] 3. Realtime voice (client + server protocol together)
- [ ] 4. Council playback machine + overlays (incl. useCouncilMachine table-drive)
- [ ] 5. Museum / button / kiosk
- [ ] 6. Routing, i18n, setup flow
- [ ] 7. Components sweep (client/tests/unit/components)
`;

writeFileSync(join(ROOT, 'docs/test-inventory.md'), md);
console.log(`wrote docs/test-inventory.md: ${rows.length} files, large ${rows.filter(r => r.lines > 400).length}, weak ${rows.filter(r => r.assertsPerCase < 1.5 && r.cases > 3 && !r.each).length}, dupes ${dupes.length}`);
